// app/sw.ts — Serwist の Service Worker ソース(withSerwistInit の swSrc がこれを指す)。
// ビルド時に public/sw.js へコンパイルされる。
//
/// <reference lib="webworker" />
//
// ↑ ServiceWorkerGlobalScope など Worker 系の型を読み込む(tsconfig の lib は dom のみのため)。
//   skipLibCheck:true なので dom lib との併存でも型の重複エラーは出ない。
//
// 要点1: skipWaiting:false にして「新版を勝手に適用しない」。ReloadPrompt バナーの
//   「更新」ボタン(= messageSkipWaiting / SKIP_WAITING メッセージ)で初めて有効化される。
//   addEventListeners() が SKIP_WAITING メッセージのハンドラを含むので、reloadApp() の
//   waiting.postMessage({ type: 'SKIP_WAITING' }) もそのまま効く。
//
// 要点2(重要): ナビゲーション(HTML)と RSC リクエストは SW でキャッシュ横取りしない。
//   @serwist/next の defaultCache は Vercel/Node 向けで、ページ遷移と RSC を NetworkFirst で
//   横取りする。これを Cloudflare Workers + opennext 上で使うと App Router のメニュー遷移
//   (RSC フェッチ)が壊れ「This page couldn't load」になる。そのため defaultCache は使わず、
//   静的アセットのみをキャッシュし、ページ遷移・RSC・API は SW が素通し(NetworkOnly)にする。
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // ビルド時に Serwist が注入するプリキャッシュ対象一覧。
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ナビゲーション安全なランタイムキャッシュ。ページ遷移・RSC・API には一切触れない。
const runtimeCaching: RuntimeCaching[] = [
  {
    // ハッシュ付きで不変のビルド済み静的アセット
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: "next-static",
      plugins: [
        new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },
  {
    // 画像・フォント・CSS などの静的リソース
    matcher: ({ request, sameOrigin }) =>
      sameOrigin &&
      ["image", "font", "style"].includes(request.destination),
    handler: new StaleWhileRevalidate({
      cacheName: "static-assets",
      plugins: [
        new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      ],
    }),
  },
  {
    // それ以外(ナビゲーション/RSC/API/document)は素通し。SW はキャッシュしない。
    matcher: () => true,
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // ← 自動適用しない(更新バナー/ロゴタップで有効化)
  clientsClaim: true,
  // navigationPreload は使わない(ナビゲーションを SW で扱わないため不要)。
  navigationPreload: false,
  runtimeCaching,
});

serwist.addEventListeners();
