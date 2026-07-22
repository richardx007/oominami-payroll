"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 50;
const SLIDE_MS = 180;

/**
 * カレンダー等の左右スワイプで前後の期間に移動するためのフック。
 *
 * 追従は React state を介さず、対象ノードの transform を直接書き換える。カレンダーはセルが多く、
 * touchmove ごとに再レンダーすると指の動きが重くなり「途中で引っかかる」体感になるため。
 * タッチイベントもノードへ直接 addEventListener で登録する(JSXへ handler/style を渡さない)。
 * React state は blank(遷移中の白紙化)だけに使い、1スワイプで数回しか変化しないので軽い。
 *
 * 使い方: 動かしたい要素に `ref={swipe.attach}` を付け、外側を `overflow-hidden` で包む。
 * セル内容は `swipe.blank ? undefined : ...` で出し分ける。
 *
 * @param resetKey 現在の期間キー(period.key)。遷移後に新データが届いて変化した時点で白紙を解除する。
 */
export function useSwipeNav(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  resetKey?: string
) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [blank, setBlank] = useState(false);
  const navigating = useRef(false);

  // 最新のコールバックを参照するための箱(リスナは1度だけ張るため)
  const cbRef = useRef({ onSwipeLeft, onSwipeRight });
  useEffect(() => {
    cbRef.current = { onSwipeLeft, onSwipeRight };
  });

  // 新しい期間のデータが読み込まれた(resetKeyが変化した)ら白紙を解除する
  useEffect(() => {
    if (navigating.current) {
      navigating.current = false;
      setBlank(false);
    }
  }, [resetKey]);

  // ノードへタッチリスナを直接登録する。JSX には ref(コールバック)しか渡さないので、
  // レンダー中の ref 参照や handler/style の受け渡しが発生しない。
  const attach = useCallback((node: HTMLDivElement | null) => {
    // 付け替え時に前ノードのリスナを外す
    const prev = elRef.current as
      | (HTMLDivElement & { __swipeCleanup?: () => void })
      | null;
    if (prev?.__swipeCleanup) {
      prev.__swipeCleanup();
      delete prev.__swipeCleanup;
    }
    elRef.current = node;
    if (!node) return;

    // 縦スクロールはブラウザ・横スワイプは自前
    node.style.touchAction = "pan-y";

    const paint = (x: number, animate: boolean) => {
      node.style.transition = animate ? `transform ${SLIDE_MS}ms ease-out` : "none";
      node.style.transform = x === 0 ? "" : `translateX(${x}px)`;
    };

    let start: { x: number; y: number } | null = null;
    let dragging = false;

    const reset = () => {
      start = null;
      dragging = false;
      paint(0, true);
      setBlank((b) => (b ? false : b));
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      dragging = false;
      paint(0, false);
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // 方向未定
        if (Math.abs(dy) >= Math.abs(dx)) {
          start = null; // 縦優勢=スクロール。以降このジェスチャは無視
          return;
        }
        dragging = true;
      }
      paint(dx, false); // 指に追従(再レンダー無し)
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || !dragging) {
        reset();
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      start = null;
      dragging = false;
      if (Math.abs(dx) < THRESHOLD) {
        paint(0, true); // 空振り: 元位置へスナップバック
        return;
      }
      const dir = dx < 0 ? -1 : 1;
      const w = Math.max(window.innerWidth, 320);
      navigating.current = true;
      paint(dir * w, true); // 現在の月を(内容を保ったまま)画面外へ
      window.setTimeout(() => {
        setBlank(true); // 入ってくる月は新データ到着まで白紙
        if (dir < 0) cbRef.current.onSwipeLeft();
        else cbRef.current.onSwipeRight();
        // 新しい月を反対側の画面外に置いてから中央へスライドイン
        paint(-dir * w, false);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => paint(0, true));
        });
      }, SLIDE_MS);
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: true });
    node.addEventListener("touchend", onEnd, { passive: true });
    node.addEventListener("touchcancel", reset, { passive: true });
    (node as HTMLDivElement & { __swipeCleanup?: () => void }).__swipeCleanup =
      () => {
        node.removeEventListener("touchstart", onStart);
        node.removeEventListener("touchmove", onMove);
        node.removeEventListener("touchend", onEnd);
        node.removeEventListener("touchcancel", reset);
      };
  }, []);

  return { blank, attach };
}
