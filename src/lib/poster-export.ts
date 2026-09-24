import { toPreviewImage, type PdfResult } from "./pdf-capture";

/**
 * 営業カレンダーのA4ポスターを PDF / PNG にする（ブラウザ専用）。
 * 旧 oominami-calendar の PosterPage.tsx で iPad/iPhone/Mac Safari の連続出力まで検証済みの方式を移植した
 * （スキル `printable-calendar` 参照）。**他の帳票の書き出し（pdf-capture.ts）と1つにまとめないこと。**
 *
 * - html2canvas-pro を使う（Tailwind v4 の oklch/oklab 色）。
 * - 🔴 **計算済みスタイルを複製先の要素へ焼き込む**。html2canvas は複製した iframe の中で描き直すため、
 *   端末によってはスタイルシートの適用が間に合わず grid/flex が全て失われ「縦1列」になる
 *   （開発機では再現しない競合状態）。
 * - PDF は jsPDF を使わず自前で書き出す（Safari で分割チャンクの読み込みに失敗することがあるため）。
 * - iOS は canvas の確保量に上限があり、解放しないと2回目以降が失敗する → 使い終わったら解放。
 * - メモリ不足に備えて解像度を下げて1回だけ再試行する。
 */

const SNAP_ATTR = "data-snap";
const SNAPSHOT_PROPS = [
  "box-sizing", "display", "position", "top", "right", "bottom", "left", "z-index",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "align-items", "align-content", "align-self", "justify-content",
  "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "grid-auto-flow",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
  "text-align", "white-space", "overflow-wrap", "word-break", "text-shadow", "vertical-align",
  "color", "background-color", "background-image", "background-size", "background-position",
  "background-repeat", "background-clip", "background-origin",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius",
  "border-bottom-left-radius", "border-bottom-right-radius",
  "overflow-x", "overflow-y", "opacity", "transform", "transform-origin", "list-style-type",
];

function snapshotComputedStyles(liveNodes: HTMLElement[], cloneRoot: HTMLElement) {
  const targets = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>(`[${SNAP_ATTR}]`))];
  for (const cloneNode of targets) {
    const liveNode = liveNodes[Number(cloneNode.getAttribute(SNAP_ATTR))];
    if (!liveNode) continue;
    // SVG の内部は自前のスケーリングを壊すので触らない（<svg> 自身は対象）
    if (cloneNode.parentElement?.closest("svg")) continue;
    const cs = window.getComputedStyle(liveNode);
    let css = "";
    for (const prop of SNAPSHOT_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (value) css += `${prop}:${value};`;
    }
    cloneNode.setAttribute("style", `${cloneNode.getAttribute("style") ?? ""};${css}`);
  }
}

type Html2Canvas = (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;

/** 縮小表示（transform）を一旦解除し、A4等倍でシートを画像化する */
async function captureCanvas(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  // 端末が解釈できない構文を含むと動的 import が undefined になるため、使える関数かを確かめる
  const mod = (await import("html2canvas-pro")) as unknown as Record<string, unknown>;
  const html2canvas = [mod?.default, mod?.html2canvas, mod].find((c) => typeof c === "function") as
    | Html2Canvas
    | undefined;
  if (!html2canvas) {
    throw new Error("画像化ライブラリを読み込めませんでした。ページを再読み込みしてお試しください。");
  }
  // Webフォント確定前に描画すると文字幅がずれるため待つ
  await document.fonts?.ready;
  const prev = el.style.transform;
  el.style.transform = "none"; // 等倍にしてから計算済みスタイルを採取する
  const liveNodes = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))];
  liveNodes.forEach((n, i) => n.setAttribute(SNAP_ATTR, String(i)));
  try {
    return await html2canvas(el, {
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      // 複製先ビューポートを A4 実寸に固定（狭い画面での再流し込みを防ぐ）
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight,
      onclone: (_doc: Document, node: HTMLElement) => snapshotComputedStyles(liveNodes, node),
    });
  } finally {
    liveNodes.forEach((n) => n.removeAttribute(SNAP_ATTR));
    el.style.transform = prev;
  }
}

function releaseCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

async function captureWithFallback(el: HTMLElement): Promise<HTMLCanvasElement> {
  try {
    const canvas = await captureCanvas(el, 2);
    if (canvas.width) return canvas;
    releaseCanvas(canvas);
  } catch (e) {
    console.warn("画像化に失敗したため解像度を下げて再試行します", e);
  }
  return captureCanvas(el, 1.4);
}

const A4_PT_W = 595.28;
const A4_PT_H = 841.89;

/** JPEG 1枚を A4 縦1ページに貼っただけの PDF を組み立てる（JPEG は再圧縮せず DCTDecode で埋め込む） */
export function buildPdfFromJpeg(jpeg: Uint8Array, pxW: number, pxH: number): Blob {
  const enc = new TextEncoder();
  const parts: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    parts.push(part);
    length += typeof part === "string" ? enc.encode(part).length : part.length;
  };
  const beginObject = () => offsets.push(length);

  push("%PDF-1.4\n");
  beginObject();
  push("1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n");
  beginObject();
  push("2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n");
  beginObject();
  push(
    `3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${A4_PT_W} ${A4_PT_H}]` +
      `/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>\nendobj\n`
  );
  beginObject();
  push(
    `4 0 obj\n<</Type/XObject/Subtype/Image/Width ${pxW}/Height ${pxH}` +
      `/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>\nstream\n`
  );
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${A4_PT_W} 0 0 ${A4_PT_H} 0 0 cm /Im0 Do Q\n`;
  beginObject();
  push(`5 0 obj\n<</Length ${enc.encode(content).length}>>\nstream\n${content}endstream\nendobj\n`);

  const xrefOffset = length;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const bytes = new Uint8Array(length);
  let pos = 0;
  for (const part of parts) {
    const chunk = typeof part === "string" ? enc.encode(part) : part;
    bytes.set(chunk, pos);
    pos += chunk.length;
  }
  return new Blob([bytes], { type: "application/pdf" });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像の生成に失敗しました"))), type, quality)
  );
}

/** ポスターを A4 1ページの PDF にする */
export async function capturePosterPdf(el: HTMLElement): Promise<PdfResult> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await captureWithFallback(el);
    const { width, height } = canvas;
    const preview = toPreviewImage(canvas);
    const jpegBlob = await toBlob(canvas, "image/jpeg", 0.92);
    releaseCanvas(canvas); // 画像化が済んだら即解放してメモリを空ける
    canvas = null;
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
    return { blob: buildPdfFromJpeg(jpeg, width, height), pages: [preview] };
  } finally {
    releaseCanvas(canvas);
  }
}

/** ポスターを PNG 画像にする */
export async function capturePosterImage(el: HTMLElement): Promise<PdfResult> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await captureWithFallback(el);
    const preview = toPreviewImage(canvas);
    const blob = await toBlob(canvas, "image/png");
    return { blob, pages: [preview] };
  } finally {
    releaseCanvas(canvas);
  }
}

/**
 * 任意の要素を「A4縦1枚」に収めた PDF にする（勤務ルール `app/work-rules` が使う）。
 * 画像化はポスターと同じ方式（html2canvas-pro＋計算済みスタイルの焼き込み、iOSのメモリ対策）。
 * 要素の縦横比は保ったまま、上下左右 marginMm の内側に収まるよう縮小して上寄せ・左右中央に置く
 * （内容が少し長くても必ず1枚に収まる。引き伸ばしはしない）。
 */
export async function captureFitA4Pdf(el: HTMLElement, marginMm = 8): Promise<PdfResult> {
  let canvas: HTMLCanvasElement | null = null;
  let page: HTMLCanvasElement | null = null;
  try {
    canvas = await captureWithFallback(el);
    // 用紙の解像度は「幅いっぱいに置いたときに等倍」になるように決める
    const pxPerMm = canvas.width / (210 - marginMm * 2);
    page = document.createElement("canvas");
    page.width = Math.round(210 * pxPerMm);
    page.height = Math.round(297 * pxPerMm);
    const ctx = page.getContext("2d");
    if (!ctx) throw new Error("canvas context を取得できませんでした");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, page.width, page.height);
    const m = marginMm * pxPerMm;
    const s = Math.min((page.width - m * 2) / canvas.width, (page.height - m * 2) / canvas.height, 1);
    const w = canvas.width * s;
    const h = canvas.height * s;
    ctx.drawImage(canvas, (page.width - w) / 2, m, w, h);
    releaseCanvas(canvas);
    canvas = null;

    const { width, height } = page;
    const preview = toPreviewImage(page);
    const jpegBlob = await toBlob(page, "image/jpeg", 0.92);
    releaseCanvas(page);
    page = null;
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
    return { blob: buildPdfFromJpeg(jpeg, width, height), pages: [preview] };
  } finally {
    releaseCanvas(canvas);
    releaseCanvas(page);
  }
}
