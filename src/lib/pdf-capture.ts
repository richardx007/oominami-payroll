import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";

/**
 * DOM要素をPDF化する共通ロジック(ブラウザ専用)。
 *
 * `admin/report/ui.tsx` の `DownloadPdfButton`(表をそのままダウンロード)と、
 * 税理士向けメールへのPDF添付(メール送信前にキャプチャしてbase64化)の両方から使う。
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

/** Blob をメール添付(base64)用の文字列に変換する */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  // btoa は一括では大きいバイナリで引数エラーになりうるためチャンクに分けて処理する
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * 通常は画面に表示しない React 要素(`PdfReportTable` のような、常に画面外に固定配置される
 * コンポーネント)を一時的にマウントし、指定id要素をPDF化してbase64を返す。
 * メール送信前にブラウザ側でPDFを作ってサーバーアクションへ渡す用途
 * (admin/report/ui.tsx の SendReportButton・admin/settings/ui.tsx の TestSendForm で共用)。
 */
export async function renderAndCapturePdfBase64(
  element: ReactElement,
  targetId: string
): Promise<string> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(element);
  try {
    // マウント直後は未描画のため2フレーム待つ
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    const el = document.getElementById(targetId);
    if (!el) throw new Error("PDF描画用の要素が見つかりません");
    const blob = await captureElementToPdfBlob(el);
    return await blobToBase64(blob);
  } finally {
    root.unmount();
    container.remove();
  }
}
