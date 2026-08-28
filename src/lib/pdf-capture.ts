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
): Promise<Blob> {
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
    firstPage = false;
    y = end;
  }

  return pdf.output("blob");
}
