"use client";

import { useEffect, useState } from "react";

/**
 * スマホでページが縮小表示されているときの案内(2026-10-28)。
 * Safari の「ぁあ」→ ページの縮小(50% など)にすると、ページから見た画面の幅が広がり、PC 用のレイアウト
 * (左のサイドバー)になって文字も小さくなる。縮小の設定はサイトごとに残り、ホーム画面アプリにも効く
 * (鈴木さんの iPhone で発生)。本人は原因に気づけないので、直し方を画面の上に出す。
 *
 * 判定: ページの幅(innerWidth)が、端末の画面の実際の幅(向きに合わせた screen の短辺/長辺)より
 * 大きく広い。iPhone の screen.width は回転しても変わらないため、向きで短辺/長辺を選ぶ。
 */
const DISMISS_KEY = "oom_zoom_hint_dismissed";

function isZoomedOut(): boolean {
  const ua = navigator.userAgent;
  if (!/iPhone|iPod|Android.*Mobile/.test(ua)) return false;
  const short = Math.min(screen.width, screen.height);
  const long = Math.max(screen.width, screen.height);
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const expected = portrait ? short : long;
  return window.innerWidth > expected * 1.15;
}

export function ZoomHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(true);

  useEffect(() => {
    const check = () => {
      try {
        if (sessionStorage.getItem(DISMISS_KEY)) return setShow(false);
      } catch {
        // sessionStorage が使えなくても案内は出す
      }
      setIos(!/Android/.test(navigator.userAgent));
      setShow(isZoomedOut());
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!show) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[10000] rounded-xl bg-amber-500 px-4 py-3 pr-10 text-sm text-white shadow-lg print:hidden"
    >
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {}
          setShow(false);
        }}
        aria-label="閉じる"
        className="absolute right-2 top-1.5 p-1 text-xl leading-none text-white/80"
      >
        ×
      </button>
      <p className="font-bold">画面が縮小表示になっています</p>
      <p className="mt-1">
        {ios
          ? "Safari でこのページを開き、アドレス欄の「ぁあ」から大きい「あ」を押して 100% に戻してください。ホーム画面のアプリにも反映されます。"
          : "ブラウザの設定で、ページの拡大/縮小(ズーム)を 100% に戻してください。"}
      </p>
    </div>
  );
}
