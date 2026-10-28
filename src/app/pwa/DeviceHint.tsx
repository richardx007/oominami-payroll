"use client";

import { useEffect } from "react";
import { STANDALONE_COOKIE, TOUCH_MAC_COOKIE } from "@/lib/device";

/**
 * 端末承認制の端末名を正しくするための目印。iPad の Safari は既定で Mac と同じ User-Agent を送るので、
 * 「Mac を名乗っているのにタッチ画面」なら Cookie を付け、サーバー(middleware)が「iPad」と記録する。
 * 判定は client-info.ts の describeClient() と同じ(maxTouchPoints が2以上の Mac は iPad)。
 * ホーム画面アプリ(PWA)で開いているかも Cookie で伝え、端末一覧の「アプリ」欄に出す
 * (Android・PC は PWA とブラウザで Cookie が共通なので、開くたびに付け外しする)。
 * ⚠️ 経費管理(oominami-business)にも同じファイルがある。
 */
export function DeviceHint() {
  useEffect(() => {
    try {
      const touchMac =
        /Macintosh|Mac OS X/.test(navigator.userAgent) &&
        !/iPhone|iPad/.test(navigator.userAgent) &&
        navigator.maxTouchPoints > 1;
      const has = document.cookie.split("; ").some((c) => c.startsWith(`${TOUCH_MAC_COOKIE}=`));
      if (touchMac && !has) {
        document.cookie = `${TOUCH_MAC_COOKIE}=1; path=/; max-age=${400 * 24 * 60 * 60}; samesite=lax; secure`;
      }
    } catch {
      // Cookie が使えない環境では何もしない(端末名が Mac のままになるだけ)
    }
    try {
      const standalone =
        (navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      const has = document.cookie.split("; ").some((c) => c.startsWith(`${STANDALONE_COOKIE}=`));
      if (standalone && !has) {
        document.cookie = `${STANDALONE_COOKIE}=1; path=/; max-age=${400 * 24 * 60 * 60}; samesite=lax; secure`;
      } else if (!standalone && has) {
        document.cookie = `${STANDALONE_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
      }
    } catch {
      // 同上(「アプリ」と出ないだけ)
    }
  }, []);
  return null;
}
