"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 50;

/**
 * カレンダー等の左右スワイプで前後の期間に移動するためのタッチハンドラ+アニメーション用styleを返す。
 * 指の動きにカレンダーがその場で追従し(ドラッグ中はtransition無し)、指を離した瞬間に
 * 閾値を超えていればそのままスライドアウトしながらページ遷移、超えていなければ元の位置へ
 * スナップバックする。縦方向の移動が大きい場合(スクロール操作)はスワイプとして扱わない。
 *
 * resetKey には現在表示中の期間キー(period.key)を渡す。スワイプ確定後、新しい期間の
 * データが実際に読み込まれて resetKey が変わったタイミングで内部状態をリセットする。
 * blank: ドラッグ〜遷移完了までの間 true。呼び出し側はこの間、前月の予定が残って見えないよう
 * カレンダーの中身(予定・実績)を非表示にするために使う。
 */
export function useSwipeNav(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  resetKey?: string
) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [blank, setBlank] = useState(false);
  const navigating = useRef(false);

  // 新しい期間のデータが読み込まれた(resetKeyが変化した)ら中身表示を戻す
  useEffect(() => {
    if (navigating.current) {
      navigating.current = false;
      setBlank(false);
    }
  }, [resetKey]);

  return {
    blank,
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        dragging.current = false;
        setAnimating(false);
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!start.current) return;
        const t = e.touches[0];
        const dx = t.clientX - start.current.x;
        const dy = t.clientY - start.current.y;
        if (!dragging.current && Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) return; // 縦スクロールと判断
        dragging.current = true;
        setBlank(true); // ドラッグ開始時点で中身を白紙にする
        setDragX(dx);
      },
      onTouchEnd: (e: React.TouchEvent) => {
        if (!start.current) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.current.x;
        const dy = t.clientY - start.current.y;
        start.current = null;
        if (
          !dragging.current ||
          Math.abs(dx) < THRESHOLD ||
          Math.abs(dx) < Math.abs(dy)
        ) {
          // 空振り: 元位置へ戻し、中身表示も復帰
          setAnimating(true);
          setDragX(0);
          setBlank(false);
          return;
        }
        const dir = dx < 0 ? -1 : 1;
        const w = Math.max(window.innerWidth, 320);
        navigating.current = true;
        setAnimating(true);
        setDragX(dir * w); // 現在の月を画面外へスライドアウト
        window.setTimeout(() => {
          if (dir < 0) onSwipeLeft();
          else onSwipeRight();
          // 遷移後、新しい月を反対側の画面外に置いてから中央へスライドインさせる
          setAnimating(false);
          setDragX(-dir * w);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              setAnimating(true);
              setDragX(0);
            });
          });
        }, 180);
      },
      // ブラウザがスクロールを引き取ると touchend ではなく touchcancel が飛び、
      // 途中位置で止まったまま(引っかかり)になることがあるため、確実に元へ戻す。
      onTouchCancel: () => {
        start.current = null;
        dragging.current = false;
        setAnimating(true);
        setDragX(0);
        setBlank(false);
      },
    },
    style: {
      transform: `translateX(${dragX}px)`,
      transition: animating ? "transform 0.18s ease-out" : "none",
      // 縦スクロールはブラウザに任せ、横方向は自前で処理する。これを指定しないと
      // ブラウザが横スワイプを独自にスクロール解釈して途中で引っかかることがある。
      touchAction: "pan-y",
    } as React.CSSProperties,
  };
}
