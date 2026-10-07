"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/**
 * ブラウザでしか読めない値(navigator / window / Notification など)を読む。
 * サーバー描画と hydration では serverValue を返し、その後ブラウザの値に切り替わる
 * (hydration の不一致を起こさない)。値の変化は追わない(画面を開いた時点の値)。
 *
 * 以前は「useEffect の中で setState」で同じことをしていたが、lint
 * (react-hooks/set-state-in-effect)に指摘されるため置き換えた(2026-10-07)。
 * ⚠️ read は呼ぶたびに同じ値を返すこと(文字列・真偽値などのプリミティブ。毎回新しい
 *    オブジェクトを返すと React が「値が変わった」とみなして描画を繰り返す)。
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNothing, read, () => serverValue);
}
