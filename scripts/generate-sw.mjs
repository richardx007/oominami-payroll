// public/sw.js を生成する。ビルドのたびに実行し、バージョンを刻印する。
//
// 設計方針(重要):
//  - この SW は fetch イベントを一切持たない。したがってナビゲーション/RSC を横取りせず、
//    App Router のメニュー遷移を壊さない(Cloudflare Workers + opennext でも安全)。
//  - 役割は「更新の検知」と「SKIP_WAITING による有効化」だけ。オフラインキャッシュは行わない。
//  - SW_VERSION が変わることで、ブラウザが新版を検知し ReloadPrompt がバナーを出す。
//  - ただし「アプリの中身が変わったとき」だけ変える。ドキュメント(docs/, README 等)だけの
//    コミットでも本番ビルドは走るが、利用者に関係しない更新でバナーを出さないため、
//    バージョンは HEAD の SHA ではなく **アプリ関連ファイルの内容ハッシュ** から作る。
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../public/sw.js");

// バージョンの対象にするファイル(= 変わったら利用者に更新を知らせるべきもの)。
// docs/ README.md CLAUDE.md .github/ .claude/ supabase/ は対象外(アプリの動作に影響しない)。
// public/sw.js 自身は .gitignore 済みなので、ここに含めても自己参照にはならない。
const APP_PATHS = [
  "src",
  "public",
  "scripts",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "open-next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "wrangler.jsonc",
  ".env",
];

// git ls-files -s は各ファイルの blob ハッシュを並べて返す。履歴を使わないので、
// Cloudflare のビルドのように履歴が浅いクローンでも同じ結果になる。
const git = (cmd) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], cwd: resolve(__dirname, "..") })
    .toString()
    .trim();

let version;
try {
  const paths = APP_PATHS.join(" ");
  const listing = git(`git ls-files -s -- ${paths}`);
  if (!listing) throw new Error("git ls-files が空(リポジトリ外?)");
  version = createHash("sha256").update(listing).digest("hex").slice(0, 12);
  // 手元の未コミット変更を含むビルド(npm run preview 等)は内容ハッシュに現れないため、
  // 毎回別バージョンにして更新検知が効くようにする。
  if (git(`git status --porcelain -- ${paths}`)) version += `-dirty${Date.now()}`;
} catch {
  version = String(Date.now());
}
if (!version) version = String(Date.now());

const sw = `/*
 * 最小 Service Worker (自動生成 / scripts/generate-sw.mjs)
 * -----------------------------------------------------------
 * fetch ハンドラを持たない = リクエストを一切横取りしない。
 * よってナビゲーション/RSC を壊さず、更新検知と SKIP_WAITING のみを担う。
 */
const SW_VERSION = ${JSON.stringify(version)};

self.addEventListener("install", () => {
  // ここでは skipWaiting しない。新版は waiting のまま留まり、ユーザーが
  // 更新バナー(またはロゴタップ)で明示的に有効化する。
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 旧 PWA(Serwist)が残したキャッシュを掃除する。この SW はキャッシュを使わない。
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* 失敗しても続行 */
      }
      // 有効化後すぐ現在のクライアントを制御下に置く。
      await self.clients.claim();
    })()
  );
});

// --- Web Push(未打刻通知) -------------------------------------------------
// fetch は依然として横取りしない。push/notificationclick はリクエストとは無関係の
// イベントなので、ナビゲーションへの影響は無い。
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    /* 本文が壊れていても通知自体は出す */
  }
  const title = data.title || "オオミナミ 給与管理";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // 同じ tag の通知は上書きされる。未打刻通知が何件も積み上がらないようにする。
      tag: data.tag || "punch-alert",
      // 積み上げずに最新だけ見せたいので renotify はしない
      data: { url: data.url || "/admin/timesheet" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      // 既に開いているウィンドウがあればそれを前面に出す(新規タブを増やさない)
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of all) {
        if ("focus" in c) {
          try {
            await c.navigate(url);
          } catch (e) {
            /* navigate 不可でも focus はする */
          }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("message", (event) => {
  // 更新バナー/ロゴタップからの要求で待機中の新版を有効化する。
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  // 更新バナーが「このバージョンは通知済み」を端末に記録するためにバージョンを問い合わせる。
  // ページを離れても記録が残るので、1デプロイにつきバナーは1回だけになる。
  if (event.data && event.data.type === "GET_VERSION") {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ version: SW_VERSION });
  }
});
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sw);
console.log(`[generate-sw] public/sw.js written (version=${version})`);
