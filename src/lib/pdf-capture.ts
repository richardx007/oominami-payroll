/**
 * PDFの生成結果。`blob` が実ファイル、`pages` はプレビュー表示用の各ページ画像。
 *
 * プレビューに**出来上がったPDFのページ画像そのもの**を使うのが要点。
 * 元のDOMを縮小して見せる方式だと「プレビューでは正しいのにPDFは崩れている」
 * という食い違いが起こりうる(2026-09-11に実際に発生)。画像なら必ず一致する。
 */
export type PdfResult = {
  blob: Blob;
  /** 1ページ=1枚。プレビュー用に軽くした JPEG の data URL */
  pages: string[];
};

/** キャンバス1ページぶんを、プレビュー表示用に軽い画像へ落とす(幅1000px上限のJPEG) */
export function toPreviewImage(source: HTMLCanvasElement): string {
  const maxW = 1000;
  if (source.width <= maxW) return source.toDataURL("image/jpeg", 0.8);
  const scaled = document.createElement("canvas");
  scaled.width = maxW;
  scaled.height = Math.round((source.height * maxW) / source.width);
  const ctx = scaled.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", 0.8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, scaled.width, scaled.height);
  ctx.drawImage(source, 0, 0, scaled.width, scaled.height);
  return scaled.toDataURL("image/jpeg", 0.8);
}

/**
 * html2canvas が作る複製ドキュメント(iframe)に、元の画面が読み込み済みのCSSを
 * `<style>` として直接書き込み、`<link rel="stylesheet">` は外す。
 *
 * ⚠️ html2canvas は `<link>` をそのまま複製し、iframe 側で**CSSを読み込み直して**から撮る。
 * その読み込みが撮影に間に合わないと、Tailwind も globals.css も効いていない素のHTML
 * (明朝体・罫線なし・PDF出力列まで出る)が撮れてしまう。税理士メールの添付PDFで
 * 実際に発生した(2026-10-10。同じ画面の「PDF」ボタンでは間に合っていたため気づきにくい)。
 * 読み込み済みのルールを書き込めば、ネットワークのタイミングに左右されない。
 */
function inlineStylesheets(cloneDoc: Document): void {
  // 読み込み済みの外部CSS(href → ルール全文)。別オリジンでルールを読めないものは除く
  const loaded = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    if (!sheet.href) continue; // <style> は html2canvas 自身が中身ごと複製する
    try {
      loaded.set(
        sheet.href,
        Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join("\n")
      );
    } catch {
      // 読めないCSSは複製側の <link> 任せにする
    }
  }
  // 元の <link> と同じ位置に <style> を置く(カスケードの順番を変えないため)
  cloneDoc
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      // 複製側は about:blank の iframe なので、href は元の画面のURLを基準に解決し直す
      const raw = link.getAttribute("href");
      if (!raw) return;
      const css = loaded.get(new URL(raw, document.baseURI).href);
      if (css === undefined) return;
      const style = cloneDoc.createElement("style");
      style.textContent = css;
      link.replaceWith(style);
    });
}

/**
 * DOM要素をPDF化する共通ロジック(ブラウザ専用)。
 *
 * `admin/report/ui.tsx` の `DownloadPdfButton`(表をそのままダウンロード)が使う。
 * 画面の表をそのまま html2canvas で画像化し、jsPDF で A4横向きに貼り付ける
 * (日本語はブラウザ側で描画されるため、PDFにフォントを埋め込む必要がない)。
 * 縦に長い場合はページを分割する。
 *
 * @param sectionSelector 指定すると、ページ分割時にこのセレクタに一致する要素の
 *   「内部」では改ページしないようにする(el の子孫に対する querySelectorAll)。
 * @param jpeg true ならページ画像を JPEG(0.92) で埋め込む。税理士へのメール添付用。
 *   PNG は jsPDF が無圧縮で埋め込むため数MBになり、メール添付・送信処理に重すぎる。
 *   ⚠️ 解像度(scale)は落とさないこと。添付用だけ scale を 1 にしたら文字がにじんで
 *   実用に耐えず、一度撤回している(2026-08-28。設計書 15.3)。
 */
export async function captureElementToPdfBlob(
  el: HTMLElement,
  opts?: { sectionSelector?: string; jpeg?: boolean }
): Promise<PdfResult> {
  // ⚠️ html2canvas(本家)ではなく html2canvas-pro を使うこと。
  // Tailwind v4 の標準カラーは oklch() で出力されるが、本家は oklch を解釈できず
  // 「Attempting to parse an unsupported color function」で失敗する(2026-07-31に発生)。
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  // レイアウト反映を待ってから撮る
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );

  const scale = 2;

  // 改ページ禁止セクションの境界位置を、キャプチャする直前のDOM座標から求め、
  // canvas座標(scale倍)に変換しておく(html2canvas を呼んだ後では要素の位置が分からない)。
  let sectionBoundaries: number[] = [];
  if (opts?.sectionSelector) {
    const elRect = el.getBoundingClientRect();
    sectionBoundaries = Array.from(el.querySelectorAll(opts.sectionSelector))
      .map((s) =>
        Math.round((s.getBoundingClientRect().top - elRect.top) * scale)
      )
      .filter((v) => v > 0); // 先頭(0)はもともと切る必要がない
  }

  const canvas = await html2canvas(el, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: inlineStylesheets,
  });

  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "landscape",
  });
  const margin = 8;
  const pageW = 297;
  const pageH = 210;
  const imgW = pageW - margin * 2;
  // 画像の実寸(mm)。1mmあたりのピクセル数を出して、ページ高さで切り分ける
  const pxPerMm = canvas.width / imgW;
  const usableH = pageH - margin * 2;
  const sliceHpx = Math.floor(usableH * pxPerMm);

  const pages: string[] = [];
  let y = 0;
  let firstPage = true;
  while (y < canvas.height) {
    const desiredEnd = Math.min(y + sliceHpx, canvas.height);
    // このページに収まる範囲(y, desiredEnd]の中にある最後の区切り位置で切る。
    // 無ければ(1セクションがページより長い等)従来どおり機械的に切る。
    let end = desiredEnd;
    if (desiredEnd < canvas.height) {
      const candidates = sectionBoundaries.filter(
        (b) => b > y && b <= desiredEnd
      );
      if (candidates.length > 0) end = candidates[candidates.length - 1];
    }
    const h = end - y;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("canvas context を取得できませんでした");
    // 余白が透明にならないよう白で塗ってから貼る
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

    if (!firstPage) pdf.addPage();
    pdf.addImage(
      opts?.jpeg ? slice.toDataURL("image/jpeg", 0.92) : slice.toDataURL("image/png"),
      opts?.jpeg ? "JPEG" : "PNG",
      margin,
      margin,
      imgW,
      h / pxPerMm
    );
    pages.push(toPreviewImage(slice));
    firstPage = false;
    y = end;
  }

  return { blob: pdf.output("blob"), pages };
}

/** Blob を Base64 文字列(data: の接頭辞なし)にする。メール添付でサーバーへ渡す用 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * html2canvas(本家)が文字の基準線を測るために body 直下に置く「見えない div + 1px の img」を、
 * 本来の行内配置(inline)に戻す。
 *
 * ⚠️ Tailwind の初期化CSSは `img { display:block }` なので、そのままだと測定用の img が改行され、
 * 基準線が大きく測られて**すべての文字が下にずれる**(セルの下の罫線に文字が付き、上が空く)。
 * 源泉徴収票のテスト印字で発覚(2026-10-11)。帳票だけのページ(Tailwind なし)では再現しない。
 * 測定用の div は style に visibility:hidden を直接持つので、それを目印にする。
 */
function fixFontMetricsProbe(cloneDoc: Document): void {
  const style = cloneDoc.createElement("style");
  style.textContent =
    'body > div[style*="visibility: hidden"] > img { display: inline !important; max-width: none !important; }';
  cloneDoc.head.appendChild(style);
}

/**
 * 自己完結したCSS(インラインの `<style>`)だけで組んだA4縦の帳票シートをPDFにする。
 * 給与明細書(`admin/close/payslip-pdf.tsx`)が使う。
 *
 * 上の `captureElementToPdfBlob` との違いと、その理由:
 *
 * 1. ⚠️ **本家 `html2canvas` を使う**(`html2canvas-pro` に変えないこと)。
 *    pro(v2) は mm 指定のレイアウトを崩す実績がある(QRシートで発生。clock.tsx のコメント参照)。
 *    この帳票は `PAYSLIP_SHEET_CSS` の16進数色のみで `oklch` を含まないため本家で問題ない。
 * 2. **画像は用紙いっぱい(0,0,210,…)に貼る**。余白はシート側の padding で作るので、
 *    CSSに書いた mm がそのまま印刷寸法になる(印の 16.5mm / 18mm 指定が効くのはこのため)。
 * 3. ⚠️ **JPEGで埋め込む**。PNGを渡すと jsPDF が展開して無圧縮で埋め込むため、
 *    A4 1枚で 9MB を超える(2026-09-11に実測。メール・LINEでの共有に耐えない)。
 *    JPEG(0.95)なら 1MB 未満で、この解像度では文字・罫線は崩れない。
 * 4. el の中に `.pslip-sheet` が複数あるときは、**シートごとに新しいページから**始める
 *    (給与明細の2ページ目「別表 立替の内訳」。2026-10-07 オーナー依頼。途中で改ページさせないため)。
 *    1枚のシートが A4 より長いときは、そのシートの中で従来どおり機械的に切る。
 */
export async function captureSheetToPdfBlob(
  el: HTMLElement
): Promise<PdfResult> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // レイアウト反映を待ってから撮る
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;
  const pages: string[] = [];
  let firstPage = true;

  const sheets = Array.from(el.querySelectorAll<HTMLElement>(".pslip-sheet"));
  for (const sheet of sheets.length > 0 ? sheets : [el]) {
    const canvas = await html2canvas(sheet, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      onclone: fixFontMetricsProbe,
    });
    const pxPerMm = canvas.width / pageW;
    const sliceHpx = Math.floor(pageH * pxPerMm);

    // ⚠️ 1mm未満の端数は切り捨てて次のページを作らない。
    // シートは min-height:297mm ちょうどで作るが、mm→px→キャンバス(scale倍)の丸めで
    // 数pxだけはみ出ることがあり、素直に `y < canvas.height` で回すと
    // **真っ白な2ページ目**が付く(2026-09-11に実測。切れて困る内容はこの数px には無い)。
    const epsilon = Math.ceil(pxPerMm);

    let y = 0;
    while (y < canvas.height - epsilon) {
      const h = Math.min(sliceHpx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("canvas context を取得できませんでした");
      // 余白が透明にならないよう白で塗ってから貼る
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

      if (!firstPage) pdf.addPage();
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.95),
        "JPEG",
        0,
        0,
        pageW,
        h / pxPerMm
      );
      pages.push(toPreviewImage(slice));
      firstPage = false;
      y += h;
    }
  }

  return { blob: pdf.output("blob"), pages };
}
