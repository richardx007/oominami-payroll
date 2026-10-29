"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * スマホでページが縮小表示されているときの案内(2026-10-28)。
 * Safari の「ぁあ」→ ページの縮小(50% など)にすると、ページから見た画面の幅が広がり、PC 用のレイアウト
 * (左のサイドバー)になって文字も小さくなる。縮小の設定はサイトごとに残り、ホーム画面アプリにも効く
 * (鈴木さんの iPhone で発生。オーナーの iPhone で再現)。本人は原因に気づけないので、直し方を出す。
 *
 * 判定: ページの幅(innerWidth)が、端末の画面の実際の幅(向きに合わせた screen の短辺/長辺)より
 * 大きく広い。iPhone の screen.width は回転しても変わらないため、向きで短辺/長辺を選ぶ。
 *
 * 表示(2026-10-29 見直し): 画面の上に出すと iPhone の時計の下のぼかしに重なって読めなかったため、画面の中央に出す。
 * 縮小で文字も小さくなっているので、案内だけは縮小の倍率ぶん大きくして(CSS zoom)ふつうの大きさに見せる。
 * ⚠️ ページの側から倍率を 100% に戻す方法は無い(ブラウザの設定で、Web ページからは変えられない)。
 */
const DISMISS_KEY = "oom_zoom_hint_dismissed";

/** 縮小の倍率の逆数(50% なら 2)。縮小されていなければ null */
function zoomOutFactor(): number | null {
  const ua = navigator.userAgent;
  if (!/iPhone|iPod|Android.*Mobile/.test(ua)) return null;
  const short = Math.min(screen.width, screen.height);
  const long = Math.max(screen.width, screen.height);
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const expected = portrait ? short : long;
  const factor = window.innerWidth / expected;
  return factor > 1.15 ? Math.min(factor, 3) : null;
}

function isStandalone(): boolean {
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function ZoomHint() {
  const pathname = usePathname();
  const [factor, setFactor] = useState<number | null>(null);
  const [env, setEnv] = useState({ ios: true, standalone: false, host: "" });

  useEffect(() => {
    const check = () => {
      try {
        if (sessionStorage.getItem(DISMISS_KEY)) return setFactor(null);
      } catch {
        // sessionStorage が使えなくても案内は出す
      }
      setEnv({ ios: !/Android/.test(navigator.userAgent), standalone: isStandalone(), host: location.host });
      setFactor(zoomOutFactor());
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!factor) return null;

  const close = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setFactor(null);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 p-4 print:hidden">
      <div
        role="alertdialog"
        aria-label="画面が縮小表示になっています"
        // 縮小のぶん案内を大きくして、ふつうの文字の大きさに見せる
        style={{ zoom: factor }}
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 text-left text-gray-800 shadow-xl"
      >
        <p className="text-base font-bold text-amber-700">画面が縮小表示になっています</p>
        <p className="mt-2 text-sm leading-relaxed">
          文字が小さく、パソコン用の画面になっています。表示の倍率を <b>100%</b> に戻してください。
        </p>
        {env.ios ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
            {env.standalone && (
              <li>
                ホーム画面のアプリでは倍率を変えられないので、<b>Safari</b> で <span className="break-all">{env.host}</span> を開く
              </li>
            )}
            <li>アドレス欄の左の「ぁあ」(または「aA」)をタップ</li>
            <li>大きい「あ」を何度か押して、真ん中の数字を <b>100%</b> にする</li>
            {env.standalone && <li>このアプリを一度閉じて、開き直す</li>}
          </ol>
        ) : (
          <p className="mt-3 text-sm leading-relaxed">ブラウザの設定で、ページの拡大/縮小(ズーム)を 100% に戻してください。</p>
        )}
        {pathname === "/install" && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm leading-relaxed text-amber-800">
            このままホーム画面に追加すると、アプリも縮小されたままになります。先に 100% に戻してから追加してください。
          </p>
        )}
        <button
          type="button"
          onClick={close}
          className="mt-4 w-full rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-200"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
