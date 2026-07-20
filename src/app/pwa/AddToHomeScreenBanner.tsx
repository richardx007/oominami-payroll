"use client";

import { useEffect, useState } from "react";

/**
 * AddToHomeScreenBanner
 * -------------------------------------------------------------
 * ITに不慣れな人でも「ホーム画面に追加」までたどり着けるよう、
 * 端末・ブラウザの状況を判定して最適な案内を出すバナー。
 *
 * 挙動:
 *  1. LINE内蔵ブラウザで開いている場合
 *       - Android: 「Chromeで開く」ボタン（ワンタップで外部ブラウザ起動）
 *       - iOS    : Safariで開き直す手順を案内
 *  2. 通常ブラウザ（Safari / Chrome）で開けている場合
 *       - Android: beforeinstallprompt を拾って「ホーム画面に追加」ボタン
 *       - iOS    : 共有ボタン → ホーム画面に追加 の手順を案内
 *  3. すでにホーム画面（PWA）から起動中 → 何も表示しない
 *
 * 使い方: `/install` ページで一度置くだけ（アプリ全体には常設しない。
 * 通常利用中に下部固定表示すると下部タブナビと重なるため）。
 * -------------------------------------------------------------
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectEnv() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isLine = /Line\//i.test(ua);
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS 13+ は Mac を偽装するので補正
    (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    (typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" &&
      (navigator as unknown as { standalone?: boolean }).standalone === true);
  return { isLine, isIOS, isAndroid, isStandalone };
}

export function AddToHomeScreenBanner() {
  const [env, setEnv] = useState<ReturnType<typeof detectEnv> | null>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // navigator/window に依存する判定はマウント後に行う(SSRとの不一致を避ける)
  useEffect(() => setEnv(detectEnv()), []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault(); // 自動バナーを抑止して、自前ボタンから出す
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!env) return null;
  // 既にホーム画面から起動 or ユーザーが閉じた場合は非表示
  if (env.isStandalone || dismissed) return null;
  // PC等（iOS/Androidでもなく、LINEでもない）は対象外
  if (!env.isLine && !env.isIOS && !env.isAndroid) return null;

  // Android LINE → Chrome を intent で直接起動
  const openInChrome = () => {
    const { host, pathname, search, hash } = window.location;
    window.location.href =
      `intent://${host}${pathname}${search}${hash}` +
      `#Intent;scheme=https;package=com.android.chrome;end`;
  };

  // Android 通常ブラウザ → ワンタップでホーム画面に追加
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
    }
  };

  // ---- 表示内容の決定 ----
  let title = "";
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;

  if (env.isLine && env.isAndroid) {
    title = "ブラウザで開いてください";
    body = "このままではホーム画面に追加できません。下のボタンからChromeで開き直してください。";
    action = (
      <button
        className="mt-3.5 w-full rounded-[10px] bg-green-500 px-4 py-3 text-[15px] font-bold text-[#04310f]"
        onClick={openInChrome}
      >
        Chromeで開く
      </button>
    );
  } else if (env.isLine && env.isIOS) {
    title = "Safariで開いてください";
    body =
      "画面下の矢印（↗）アイコンをタップ →「Safariで開く」を選ぶと、ホーム画面に追加できます。";
  } else if (env.isAndroid) {
    title = "ホーム画面に追加できます";
    if (deferredPrompt) {
      body = "アプリのように使えるようになります。";
      action = (
        <button
          className="mt-3.5 w-full rounded-[10px] bg-green-500 px-4 py-3 text-[15px] font-bold text-[#04310f]"
          onClick={handleInstall}
        >
          ホーム画面に追加
        </button>
      );
    } else {
      body =
        "右上の ⋮ メニュー →「アプリをインストール」または「ホーム画面に追加」を選んでください。";
    }
  } else if (env.isIOS) {
    title = "ホーム画面に追加できます";
    body =
      "画面下の共有ボタン（□に↑）→「ホーム画面に追加」を選ぶと、アプリのように使えます。";
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-x-3 bottom-3 z-[9999] rounded-[14px] bg-gray-800 px-[18px] pb-[18px] pt-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
    >
      <button
        onClick={() => setDismissed(true)}
        aria-label="閉じる"
        className="absolute right-2.5 top-2 p-1 text-2xl leading-none text-white/70"
      >
        ×
      </button>
      <div className="mb-1.5 pr-5 text-[15px] font-bold">{title}</div>
      <div className="text-sm text-white/90">{body}</div>
      {action}
    </div>
  );
}
