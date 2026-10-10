"use client";

import { useEffect } from "react";
import { TOUCH_MAC_COOKIE } from "@/lib/device";

/**
 * 端末承認制の端末名を正しくするための目印。iPad の Safari は既定で Mac と同じ User-Agent を送るので、
 * 「Mac を名乗っているのにタッチ画面」なら Cookie を付け、サーバー(middleware)が「iPad」と記録する。
 * 判定は client-info.ts の describeClient() と同じ(maxTouchPoints が2以上の Mac は iPad)。
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
  }, []);
  return null;
}
