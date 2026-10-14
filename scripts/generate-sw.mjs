// public/sw.js を生成する。ビルドのたびに実行し、バージョンを刻印する。
//
// 設計方針(重要):
//  - fetch は画面の読み込み(navigate の GET)だけを見て、Cloudflare のエラー(Error 1102 等)の
//    ときだけ復帰画面に差し替える(RECOVERY_SNIPPET)。RSC・API は横取りしないので、
//    App Router のメニュー遷移を壊さない(Cloudflare Workers + opennext でも安全)。
//  - 役割は「更新の検知」「SKIP_WAITING による有効化」「Web Push」「復帰画面」。オフラインキャッシュは行わない。
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

// 画面を開けなかったときの復帰画面(2026-10-14)。経費管理(oominami-business)の
// scripts/generate-sw.mjs にも同じものがある(経費の画面は経費の SW が受け持つため)。直すときは両方。
const RECOVERY_SNIPPET = `// --- 画面を開けなかったときの復帰画面(2026-10-14) ---------------------------
// Cloudflare 無料プランは1回の処理の CPU 時間に上限があり、超えると Cloudflare が処理を止めて
// 「Worker exceeded CPU time limit.」などの英語の文字だけの画面(Error 1102)を返す。アプリの外で
// 作られる画面なのでボタンを置けず、ホーム画面アプリには戻るボタンも無いため、元の画面へ戻れなくなる。
// そこで画面の読み込み(navigate の GET)だけを見て、「500番台かつ HTML ではない」応答と通信エラーの
// ときだけ、再読み込み/戻る/ホームのボタンがある画面に差し替える。それ以外(正常・リダイレクト・
// アプリ自身のエラー画面)は受け取った応答をそのまま返す。キャッシュはしない。
// ⚠️ 横取りするのはこの用途だけ。RSC・API・サーバーアクション・静的ファイルには触らない
//    (fetch を広く横取りして本番障害になった過去があるため)。
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    (async () => {
      let res;
      try {
        res = await fetch(req);
      } catch (e) {
        return recoveryPage(req.url, 503, "通信できませんでした");
      }
      const type = res.headers.get("content-type") || "";
      if (res.status < 500 || type.includes("text/html")) return res;
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch (e) {
        /* 本文が読めなくても復帰画面は出す */
      }
      return recoveryPage(req.url, res.status, detail);
    })()
  );
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function recoveryPage(url, status, detail) {
  const path = new URL(url).pathname;
  const isExpense = path === "/expense" || path.startsWith("/expense/");
  const home = isExpense ? "/expense/" : "/";
  const color = isExpense ? "#1b4332" : "#152449";
  const time = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const html =
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    "<title>画面を表示できませんでした</title><style>" +
    "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;color:#111827;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Hiragino Kaku Gothic ProN',Meiryo,sans-serif}" +
    "main{box-sizing:border-box;width:calc(100% - 32px);max-width:420px;margin:16px 0;padding:28px 24px;background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}" +
    "h1{margin:0 0 12px;font-size:20px}p{margin:0 0 20px;font-size:15px;line-height:1.7}" +
    "button,a{display:block;box-sizing:border-box;width:100%;margin-top:10px;padding:14px;border-radius:12px;font-size:16px;font-weight:bold;text-align:center;text-decoration:none;cursor:pointer;font-family:inherit}" +
    ".main{background:" + color + ";color:#fff;border:0}.sub{background:#fff;color:" + color + ";border:1px solid " + color + "}" +
    "small{display:block;margin-top:20px;color:#6b7280;font-size:12px;line-height:1.6;word-break:break-all}" +
    "</style></head><body><main>" +
    "<h1>画面を表示できませんでした</h1>" +
    "<p>サーバーが一時的に処理しきれませんでした。少し待ってから「もう一度読み込む」を押してください。" +
    "直らないときは「前の画面に戻る」か「ホームへ」を押してください。</p>" +
    '<button class="main" onclick="location.reload()">もう一度読み込む</button>' +
    '<button class="sub" onclick="history.length > 1 ? history.back() : location.assign(\\'' + home + "\\')\\">前の画面に戻る</button>" +
    '<a class="sub" href="' + home + '">ホームへ</a>' +
    "<small>" + escapeHtml(time) + " / " + escapeHtml(status) + " " + escapeHtml(detail) + "<br>" + escapeHtml(path) + "</small>" +
    "</main></body></html>";
  return new Response(html, {
    status: status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
`;

const sw = `/*
 * 最小 Service Worker (自動生成 / scripts/generate-sw.mjs)
 * -----------------------------------------------------------
 * キャッシュは使わない。fetch は「画面の読み込みが Cloudflare のエラーになったとき」だけ
 * 復帰画面に差し替える(それ以外は受け取った応答をそのまま返す)。RSC・API は横取りしない。
 * 役割は更新検知・SKIP_WAITING・Web Push・この復帰画面。
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

${RECOVERY_SNIPPET}
// --- Web Push(未打刻通知) -------------------------------------------------
// push/notificationclick はリクエストとは無関係の
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
