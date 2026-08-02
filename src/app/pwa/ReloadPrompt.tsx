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

// 「このバージョンについては通知済み」を端末に残すキー。ページを離れても効くので、
// 1デプロイにつきバナーを1回に限定できる(ref だけだとリロードでリセットされる)。
const NOTIFIED_KEY = "sw-notified-version";

// 待機中の新 SW に自分のバージョン(SW_VERSION)を尋ねる。
// 取得できない場合(古い SW・非対応・タイムアウト)は null を返し、呼び出し側は
// 従来どおりの「同一インスタンス1回」判定にフォールバックする。
function askVersion(sw: ServiceWorker, timeoutMs = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => finish(e.data?.version ?? null);
      sw.postMessage({ type: "GET_VERSION" }, [ch.port2]);
      window.setTimeout(() => finish(null), timeoutMs);
    } catch {
      finish(null);
    }
  });
}

function readNotified(): string | null {
  try {
    return window.localStorage.getItem(NOTIFIED_KEY);
  } catch {
    return null; // プライベートモード等で localStorage が使えない場合
  }
}

function writeNotified(version: string) {
  try {
    window.localStorage.setItem(NOTIFIED_KEY, version);
  } catch {
    /* 記録できなくてもバナーの動作自体は継続する */
  }
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
  // ※これはページを開いている間だけの防御。リロードを跨ぐ防御は localStorage 側。
  const notifiedRef = useRef<ServiceWorker | null>(null);
  // 表示中バナーが対象としている SW のバージョン(取得できた場合)。
  const versionRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 登録時点で既に制御 SW があれば「更新」判定、無ければ初回インストール。
    const hadController = !!navigator.serviceWorker.controller;
    let timer: number | undefined;
    let reloaded = false;
    let cancelled = false;
    let visibilityCleanup: (() => void) | undefined;

    const showBanner = (sw: ServiceWorker) => {
      // 同一の待機 SW については一度きり通知する(再デプロイで別インスタンスが
      // 現れたときだけ再表示)。✕で閉じた版もこれで再ポップしない。
      if (notifiedRef.current === sw) return;
      notifiedRef.current = sw;
      waitingRef.current = sw;
      // バージョンを尋ね、この端末で既に通知済みのデプロイなら出さない。
      // 更新ボタンを押した直後は新 SW が waiting のまま残ることがあり(有効化は
      // 全クライアントが離れるまで遅れうる)、リロード後に同じ更新でもう一度
      // バナーが出てしまうのを防ぐ。SW は fetch を横取りしないため、一度
      // リロードした時点でアプリの中身は最新になっており、再通知は不要。
      void askVersion(sw).then((version) => {
        if (cancelled) return;
        if (version) {
          if (readNotified() === version) return;
          versionRef.current = version;
        }
        setNeedRefresh(true);
      });
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
      cancelled = true;
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
            // このデプロイは対応済みとして記録する。リロード後に新 SW がまだ
            // waiting でも、同じ更新でバナーが再表示されない。
            if (versionRef.current) writeNotified(versionRef.current);

            const sw = waitingRef.current;
            let done = false;
            const reloadOnce = () => {
              if (done) return;
              done = true;
              window.location.reload();
            };
            // 新 SW が実際に有効化されてからリロードする。以前は 0.8 秒固定で
            // リロードしていたが、iOS standalone では有効化が間に合わず
            // 「新版が waiting のまま残る → リロード後にもう一度バナー」に
            // なっていた。activated / controllerchange のどちらかを待つ。
            try {
              sw?.addEventListener("statechange", () => {
                if (sw.state === "activated") reloadOnce();
              });
              sw?.postMessage({ type: "SKIP_WAITING" });
            } catch {
              /* 失敗してもフォールバックでリロードする */
            }
            // 上記が発火しない端末向けの保険。この SW はキャッシュしないので
            // リロード＝最新版取得であり、待ちすぎない範囲で余裕を持たせる。
            window.setTimeout(reloadOnce, 2500);
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
            onClick={() => {
              // ✕ で閉じた場合もこのデプロイは通知済みとして記録する
              // (以前はリロードのたびに同じ更新で再表示されていた)。
              // 未更新のままにはならない: この SW はキャッシュしないため、
              // 次にアプリを開き直した時点で中身は最新になる。
              if (versionRef.current) writeNotified(versionRef.current);
              setNeedRefresh(false);
            }}
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
