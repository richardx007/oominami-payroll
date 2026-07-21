"use client";

import { useRef } from "react";

/**
 * カレンダー等の左右スワイプで前後の期間に移動するためのタッチハンドラを返す。
 * 縦方向の移動が大きい場合(スクロール操作)は無視し、横方向の移動が閾値を超えた
 * 場合のみ onSwipeLeft/onSwipeRight を呼ぶ。
 */
export function useSwipeNav(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      const THRESHOLD = 50;
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
  };
}
