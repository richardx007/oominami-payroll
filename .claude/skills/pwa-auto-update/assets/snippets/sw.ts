// app/sw.ts — Serwist の Service Worker ソース(withSerwistInit の swSrc がこれを指す)。
// ビルド時に public/sw.js へコンパイルされる。
//
// 要点: skipWaiting:false にして「新版を勝手に適用しない」。ReloadPrompt バナーの
// 「更新」ボタン(= messageSkipWaiting / SKIP_WAITING メッセージ)で初めて有効化される。
// addEventListeners() が SKIP_WAITING メッセージのハンドラを含むので、reloadApp() の
// waiting.postMessage({ type: 'SKIP_WAITING' }) もそのまま効く。
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // ビルド時に Serwist が注入するプリキャッシュ対象一覧。
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // ← 自動適用しない(ユーザー操作で更新)
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
