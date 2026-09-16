// public/sw.js を生成する。ビルドのたびに実行し、バージョンを刻印する。
//
// 設計方針(重要):
//  - この SW は fetch イベントを一切持たない。したがってナビゲーション/RSC を横取りせず、
//    App Router のメニュー遷移を壊さない(Cloudflare Workers + opennext でも安全)。
//  - 役割は「更新の検知」と「SKIP_WAITING による有効化」だけ。オフラインキャッシュは行わない。
//  - SW_VERSION が変わることで、ブラウザが新版を検知し ReloadPrompt がバナーを出す。
//  - ただし変えるのは「アプリの中身が変わったとき」だけにする。git SHA を刻む方式だと、
//    ドキュメント(docs/ README 等)だけのコミットでもデプロイのたびにバナーが出て、
//    利用者には無関係な更新を promptされる。そこで APP_PATHS の内容ハッシュから作る。
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const outPath = resolve(projectRoot, "public/sw.js");

// バージョンの対象にするファイル(= 変わったら利用者に更新を知らせるべきもの)。
// プロジェクトに合わせて増減する。存在しないパスを並べても害はない(git が無視する)。
// docs/ README.md .github/ など、アプリの動作に影響しないものは入れないこと
// (入れると、その更新だけで更新バナーが出る)。
// public/sw.js 自身は .gitignore 済みなので、public を含めても自己参照にはならない。
const APP_PATHS = [
  "src",
  "public",
  "scripts",
  "index.html", // Vite
  "package.json",
  "package-lock.json",
  "next.config.ts", // Next
  "open-next.config.ts", // Next + Cloudflare(opennext)
  "vite.config.ts", // Vite
  "postcss.config.mjs",
  "tsconfig.json",
  "wrangler.jsonc",
  ".env", // 追跡している場合のみ(ビルド時にバンドルへ焼き込まれるため)
];

const git = (cmd) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], cwd: projectRoot })
    .toString()
    .trim();

let version;
try {
  const paths = APP_PATHS.join(" ");
  // git ls-files -s は各ファイルの blob ハッシュを並べて返す。**履歴を使わない**ので、
  // CI の浅いクローン(depth=1)でも同じ結果になる。
  // ※ `git log -1 --format=%h -- <paths>`(最後にアプリを変えたコミット)方式は、
  //    浅いクローンだと該当コミットが履歴に無く空を返すため使わないこと。
  const listing = git(`git ls-files -s -- ${paths}`);
  if (!listing) throw new Error("git ls-files が空(リポジトリ外?)");
  version = createHash("sha256").update(listing).digest("hex").slice(0, 12);
  // 未コミット変更を含むビルド(ローカルのプレビュー等)は内容ハッシュに現れないため、
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
