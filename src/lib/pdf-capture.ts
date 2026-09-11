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
 * DOM要素をPDF化する共通ロジック(ブラウザ専用)。
 *
 * `admin/report/ui.tsx` の `DownloadPdfButton`(表をそのままダウンロード)が使う。
 * 画面の表をそのまま html2canvas で画像化し、jsPDF で A4横向きに貼り付ける
 * (日本語はブラウザ側で描画されるため、PDFにフォントを埋め込む必要がない)。
 * 縦に長い場合はページを分割する。
 *
 * @param sectionSelector 指定すると、ページ分割時にこのセレクタに一致する要素の
 *   「内部」では改ページしないようにする(el の子孫に対する querySelectorAll)。
 */
export async function captureElementToPdfBlob(
  el: HTMLElement,
  opts?: { sectionSelector?: string }
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
      slice.toDataURL("image/png"),
      "PNG",
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

  const canvas = await html2canvas(el, {
    scale: 3,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;
  const pxPerMm = canvas.width / pageW;
  const sliceHpx = Math.floor(pageH * pxPerMm);

  // ⚠️ 1mm未満の端数は切り捨てて次のページを作らない。
  // シートは min-height:297mm ちょうどで作るが、mm→px→キャンバス(scale倍)の丸めで
  // 数pxだけはみ出ることがあり、素直に `y < canvas.height` で回すと
  // **真っ白な2ページ目**が付く(2026-09-11に実測。切れて困る内容はこの数px には無い)。
  const epsilon = Math.ceil(pxPerMm);

  const pages: string[] = [];
  let y = 0;
  let firstPage = true;
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

  return { blob: pdf.output("blob"), pages };
}
