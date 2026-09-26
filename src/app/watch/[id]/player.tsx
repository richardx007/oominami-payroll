"use client";

import { useRef } from "react";

/**
 * 画面いっぱいの動画プレイヤー。黒背景に動画を縦横比を保って最大に表示する。
 * - スマホを横にしたとき（高さが低い横長）は、見出し・概略を隠して動画だけにする。
 * - 「全画面」: iPhone は video の webkitEnterFullscreen（標準プレイヤーの全画面）、それ以外は requestFullscreen。
 * - 「閉じる」: アプリ内から来たら前の画面へ、それ以外はホームへ（勤務ルール画面と同じ）。
 */
export function WatchPlayer({ title, summary, src }: { title: string; summary: string; src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  function close() {
    const fromApp =
      window.history.length > 1 &&
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin;
    if (fromApp) window.history.back();
    else window.location.href = "/";
  }

  function fullscreen() {
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  }

  // 横向きのスマホ（高さ500px以下の横長）では見出し・概略を出さない
  const hideOnLandscapePhone = "[@media(orientation:landscape)_and_(max-height:500px)]:hidden";

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <header
        className={`flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] ${hideOnLandscapePhone}`}
      >
        <p className="mr-auto min-w-0 truncate text-base font-bold">{title}</p>
        <button
          type="button"
          onClick={fullscreen}
          className="shrink-0 touch-manipulation rounded-lg border border-white/40 px-3 py-1.5 text-sm font-bold active:opacity-70"
        >
          ⛶ 全画面
        </button>
        <button
          type="button"
          onClick={close}
          className="flex shrink-0 touch-manipulation items-center gap-1 rounded-lg border border-white/40 px-3 py-1.5 text-sm font-bold active:opacity-70"
        >
          <span aria-hidden="true" className="text-lg leading-none">×</span>
          閉じる
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
        />
        {/* 横向きのスマホでは見出しを隠すので、閉じるボタンだけ左上に重ねる */}
        <button
          type="button"
          onClick={close}
          aria-label="閉じる"
          className="absolute left-[max(0.5rem,env(safe-area-inset-left))] top-2 hidden h-10 w-10 touch-manipulation place-items-center rounded-full bg-black/50 text-xl [@media(orientation:landscape)_and_(max-height:500px)]:grid"
        >
          ×
        </button>
      </div>

      {summary && (
        <p
          className={`max-h-[25dvh] shrink-0 overflow-y-auto whitespace-pre-line px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 text-sm text-gray-300 ${hideOnLandscapePhone}`}
        >
          {summary}
        </p>
      )}
    </div>
  );
}
