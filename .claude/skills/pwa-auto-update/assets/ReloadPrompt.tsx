"use client";

import { useEffect, useRef, useState } from "react";
import { Serwist } from "@serwist/window";

// ReloadPrompt — 新しいバージョン(Service Worker)を検知したら画面上部中央に
// バナーを出し、ワンタップで有効化＋リロードする。開きっぱなしの端末でも気づけるよう、
// 登録後は一定間隔で更新チェックをポーリングする。
//
// Next.js(App Router)版。SW の登録・更新検知は @serwist/window の Serwist クラスで行う。
// ※ @serwist/next の withSerwistInit は register:false にして、登録をこの component に一本化する
//    (二重登録を防ぐため)。
//
// 依存はランタイム(React)と @serwist/window のみ。Tailwind やアイコンライブラリに依存
// しないよう、見た目はインラインスタイルで完結させている。色・文言・間隔・位置は props で差し替え可能。

export interface ReloadPromptProps {
  /** バナー本文。既定「新しいバージョンがあります」。 */
  message?: string;
  /** 更新ボタンのラベル。既定「更新」。 */
  buttonLabel?: string;
  /** 更新ボタンの背景色。既定 '#2563eb'(青)。 */
  accentColor?: string;
  /** 新版チェックのポーリング間隔(ms)。既定 60000(1分)。 */
  intervalMs?: number;
  /** バナーの表示位置。既定 'top'。 */
  position?: "top" | "bottom";
  /** 登録する SW のパス。既定 '/sw.js'(withSerwistInit の swDest に合わせる)。 */
  swUrl?: string;
}

export function ReloadPrompt({
  message = "新しいバージョンがあります",
  buttonLabel = "更新",
  accentColor = "#2563eb",
  intervalMs = 60_000,
  position = "top",
  swUrl = "/sw.js",
}: ReloadPromptProps = {}) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const serwistRef = useRef<Serwist | null>(null);
  // ユーザーが「更新」をタップして更新を開始したか。controlling リロードのガードに使う。
  const updatingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const serwist = new Serwist(swUrl, { scope: "/", type: "classic" });
    serwistRef.current = serwist;

    // 待機中(waiting)の新 SW を検知したらバナーを出す。
    serwist.addEventListener("waiting", () => setNeedRefresh(true));
    // 新 SW が制御を取ったら 1 回だけリロードして最新版に切り替える。
    // ただし初回インストール(clientsClaim による初掌握)でも controlling は発火するため、
    // ユーザーが「更新」を押したときだけリロードする。これが無いと導入直後の初回訪問で
    // バナーを経ずに勝手にリロードが 1 回走ってしまう。
    let reloaded = false;
    serwist.addEventListener("controlling", () => {
      if (!updatingRef.current || reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    void serwist.register();

    // 開きっぱなしの端末でも新版に気づけるよう、一定間隔で更新チェック。
    const timer = window.setInterval(() => {
      // オフライン時などの update() 失敗は無視(次回チェックで再試行)
      serwist.update().catch(() => {});
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [swUrl, intervalMs]);

  if (!needRefresh) return null;

  const vertical =
    position === "top"
      ? { top: 0, paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }
      : { bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        zIndex: 2147483000,
        display: "flex",
        justifyContent: "center",
        padding: "0 1rem",
        ...vertical,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "#222",
          color: "#fff",
          padding: "10px 14px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          font: "14px/1.4 system-ui, sans-serif",
        }}
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={() => {
            // ユーザー起点の更新であることを記録 → controlling イベントでリロードされる。
            updatingRef.current = true;
            serwistRef.current?.messageSkipWaiting();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 8,
            border: "none",
            background: accentColor,
            color: "#fff",
            padding: "6px 12px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {buttonLabel}
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="閉じる"
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.6)",
            padding: 4,
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
