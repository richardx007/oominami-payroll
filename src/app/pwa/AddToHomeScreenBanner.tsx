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
 *                  （iOS26で共有ボタンの位置がアドレスバー長押しに変わったため、
 *                  バージョン判定はせず両方の導線を1文で併記している）
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

/**
 * iOS/Safariの共有アイコン（四角から上向き矢印）。iOS26で表示場所は変わったが
 * アイコン自体はそのまま使われ続けている（オーナーが実機スクリーンショットで確認済み）ため、
 * 案内文に添えて視覚的に分かりやすくする。
 */
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v11" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11h-.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H18" />
    </svg>
  );
}

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
    body = (
      <>
        画面下の矢印（↗）アイコンをタップ →「Safariで開く」を選ぶと、ホーム画面に追加できます。
      </>
    );
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
    // iOS26(2025年秋以降)からSafariの共有ボタンが画面下から消え、アドレスバー長押しで
    // 出す方式に変わった。旧バージョンとの併用期間が長く続くため、バージョン判定はせず
    // 両方の導線を1文で案内する(正式版でUIがさらに変わっても壊れにくいようにするため)。
    // アイコン自体(四角+上向き矢印)はiOS26でも変わっていないため、視覚的な目印として添える。
    body = (
      <>
        共有ボタン（
        <ShareIcon className="inline-block h-4 w-4 -translate-y-px align-middle" />
        のアイコン。画面下にある場合はそのまま、無い場合はアドレスバーを長押し）から
        「ホーム画面に追加」を選ぶと、アプリのように使えます。
      </>
    );
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
