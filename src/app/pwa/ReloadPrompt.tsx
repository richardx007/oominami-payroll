"use client";

import { useEffect, useRef, useState } from "react";

// ReloadPrompt — 新しいバージョン(Service Worker)を検知したら画面上部にバナーを出し、
// ワンタップで有効化＋リロードする。素の navigator.serviceWorker のみで実装(依存追加なし)。
//
// 生成 SW(scripts/generate-sw.mjs)は fetch を横取りしないため、この仕組みは
// ナビゲーションに一切影響しない。更新検知は SW スクリプト(/sw.js)の内容が
// デプロイごとに変わる(SW_VERSION)ことで行われる。

export interface ReloadPromptProps {
  message?: string;
  buttonLabel?: string;
  accentColor?: string;
  /** 更新チェックのポーリング間隔(ms)。既定 60000(1分)。 */
  intervalMs?: number;
  position?: "top" | "bottom";
}

export function ReloadPrompt({
  message = "新しいバージョンがあります",
  buttonLabel = "更新",
  accentColor = "#152449",
  intervalMs = 60_000,
  position = "top",
}: ReloadPromptProps = {}) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updating, setUpdating] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);
  // 同じ待機 SW を何度も通知しないための記録。ポーリング/タブ復帰/updatefound など
  // 複数経路から同一バージョンで showBanner が呼ばれてもバナーは1回だけにする。
  const notifiedRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 登録時点で既に制御 SW があれば「更新」判定、無ければ初回インストール。
    const hadController = !!navigator.serviceWorker.controller;
    let timer: number | undefined;
    let reloaded = false;
    let visibilityCleanup: (() => void) | undefined;

    const showBanner = (sw: ServiceWorker) => {
      // 同一の待機 SW については一度きり通知する(再デプロイで別インスタンスが
      // 現れたときだけ再表示)。✕で閉じた版もこれで再ポップしない。
      if (notifiedRef.current === sw) return;
      notifiedRef.current = sw;
      waitingRef.current = sw;
      setNeedRefresh(true);
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // 既に待機中の新版があれば即バナー表示。
        // waiting は「有効な active がある状態で新版が控えている」ときだけ立つので、
        // これ自体が更新の証拠。iOS standalone で controller が null でも判定できるよう、
        // navigator.serviceWorker.controller には依存しない。
        if (reg.waiting) {
          showBanner(reg.waiting);
        }
        // 新版のインストールを検知したらバナー表示(初回インストールは除く)。
        // 初回インストール時は reg.active が無い(まだ何も有効化されていない)ため、
        // reg.active の有無で「更新」か「初回」かを判別する(controller 非依存)。
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          const hadActive = !!reg.active;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && hadActive) {
              showBanner(reg.waiting ?? nw);
            }
          });
        });
        // 開きっぱなしの端末でも気づけるよう定期的に更新チェック
        timer = window.setInterval(() => {
          reg.update().catch(() => {});
        }, intervalMs);
        // iOS standalone はバックグラウンドから復帰(再表示)することが多いので、
        // 可視化のたびに更新チェックし、待機中の新版があればバナーを出す。
        const onVisible = () => {
          if (document.visibilityState !== "visible") return;
          reg
            .update()
            .then(() => {
              if (reg.waiting) showBanner(reg.waiting);
            })
            .catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisible);
        visibilityCleanup = () =>
          document.removeEventListener("visibilitychange", onVisible);
      })
      .catch(() => {});

    // 新 SW が制御を取ったら 1 回だけリロード。初回インストール(clientsClaim による
    // 初掌握)では hadController=false のため誤リロードしない。
    const onControllerChange = () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (timer) window.clearInterval(timer);
      visibilityCleanup?.();
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [intervalMs]);

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
          disabled={updating}
          onClick={() => {
            if (updating) return;
            // クリックが効いたことを伝えるため、まず「更新中...」に切り替える。
            setUpdating(true);
            // iOS Safari(standalone)では controllerchange や非同期処理が確実に動かない
            // ことがあるため、最小限かつ確実に処理する:
            //   1) 待機中の新 SW に SKIP_WAITING を投げる(ベストエフォート)。有効化されると
            //      controllerchange でリロードされる。
            //   2) 発火しない環境向けに、少し待ってからフォールバックでリロードする。
            //      この SW はキャッシュしないので、リロード＝最新版取得。
            try {
              waitingRef.current?.postMessage({ type: "SKIP_WAITING" });
            } catch {
              /* 失敗してもリロードする */
            }
            // 「更新中...」を一瞬見せてからリロード(controllerchange が先に来れば
            // そちらでリロードされ、このタイマーは実行前に遷移する)。
            window.setTimeout(() => window.location.reload(), 800);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 8,
            border: "none",
            background: accentColor,
            color: "#fff",
            padding: "10px 18px",
            minHeight: 40,
            fontSize: 15,
            fontWeight: 700,
            cursor: updating ? "default" : "pointer",
            opacity: updating ? 0.75 : 1,
            touchAction: "manipulation",
            WebkitTapHighlightColor: "rgba(255,255,255,0.3)",
          }}
        >
          {updating ? "更新中..." : buttonLabel}
        </button>
        {!updating && (
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            aria-label="閉じる"
            style={{
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.6)",
              padding: 10,
              minHeight: 40,
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
