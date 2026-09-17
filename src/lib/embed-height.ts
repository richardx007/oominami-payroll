/**
 * 埋め込み（iframe）の高さ合わせ。
 * iframe の中身が親の指定した高さより高いと、HP側に内側のスクロールバーが出てしまうため、
 * 中身の高さを親へ postMessage で知らせ、親が iframe の height を合わせる。
 * 親（ホームページ）に貼るスクリプトは管理画面「ホームページでの見え方」の埋め込みコードに含まれる。
 */

export const EMBED_HEIGHT_MESSAGE = "oominami-calendar-height";

export type EmbedHeightMessage = { type: typeof EMBED_HEIGHT_MESSAGE; height: number };

export function isEmbedHeightMessage(data: unknown): data is EmbedHeightMessage {
  if (typeof data !== "object" || data === null) return false;
  const m = data as Record<string, unknown>;
  return m.type === EMBED_HEIGHT_MESSAGE && typeof m.height === "number" && m.height > 0;
}

/**
 * 中身の高さを監視して親へ知らせる（iframe の中でだけ動く）。戻り値は後片付け。
 * 高さは body の実寸（html/body は埋め込みページで min-height:0 にしてある）。
 */
export function reportEmbedHeight(): () => void {
  if (typeof window === "undefined" || window.parent === window) return () => {};
  let last = 0;
  const send = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().height);
    // 1px 未満の揺れは無視（フォント読み込み等で微妙に変わる）
    if (h > 0 && Math.abs(h - last) > 1) {
      last = h;
      const message: EmbedHeightMessage = { type: EMBED_HEIGHT_MESSAGE, height: h };
      // 埋め込み先は限定しない（公開情報の高さだけを送る）
      window.parent.postMessage(message, "*");
    }
  };
  send();
  const ro = new ResizeObserver(send);
  ro.observe(document.body);
  // 画像やフォントの読み込み後にも1回
  window.addEventListener("load", send);
  // 埋め込み先のスクリプトが後から読み込まれて最初の1通を取りこぼす場合に備え、
  // 少し経ってから同じ高さでも送り直す
  const resend = [1000, 3000].map((ms) =>
    window.setTimeout(() => {
      last = 0;
      send();
    }, ms)
  );
  return () => {
    ro.disconnect();
    window.removeEventListener("load", send);
    resend.forEach((t) => window.clearTimeout(t));
  };
}
