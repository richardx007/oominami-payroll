"use client";

import { useRef, useState } from "react";

const THRESHOLD = 50;

/**
 * カレンダー等の左右スワイプで前後の期間に移動するためのタッチハンドラ+アニメーション用styleを返す。
 * 指の動きにカレンダーがその場で追従し(ドラッグ中はtransition無し)、指を離した瞬間に
 * 閾値を超えていればそのままスライドアウトしながらページ遷移、超えていなければ元の位置へ
 * スナップバックする。縦方向の移動が大きい場合(スクロール操作)はスワイプとして扱わない。
 */
export function useSwipeNav(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);

  return {
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
      setDragX(dx);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      if (!dragging.current || Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)) {
        setAnimating(true);
        setDragX(0);
        return;
      }
      const dir = dx < 0 ? -1 : 1;
      const w = Math.max(window.innerWidth, 320);
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
    style: {
      transform: `translateX(${dragX}px)`,
      transition: animating ? "transform 0.18s ease-out" : "none",
    } as React.CSSProperties,
  };
}
