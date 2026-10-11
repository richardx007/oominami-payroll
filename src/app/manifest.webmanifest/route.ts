import { isHandoffToken } from "@/lib/device";

/**
 * /manifest.webmanifest(PWA のマニフェスト)。layout の metadata.manifest からリンクする。
 *
 * 以前は src/app/manifest.ts(静的)だったが、端末承認制の「引き継ぎ札」を起動先に付けるため
 * ルートハンドラにした: ?h=札 で呼ばれたら start_url を /?h=札 にする。札は「ホーム画面に追加」の
 * 案内(/install)を承認済みの端末で開いたときだけ発行され、そのページのマニフェストのリンクに付く。
 * iPhone はホーム画面に追加するときにこの start_url を覚え、ホーム画面アプリを初めて開くと札付きで
 * 起動する(→ middleware が預かり、ログイン後に device_handoff_redeem で承認)。
 *
 * id を "/" に固定して、札の有無で別のアプリ扱いにならないようにする。
 * アイコンは PNG(public/icon-192.png / icon-512.png)。iOS/Android のホーム画面・Dock は
 * SVG アイコンを使えないため PNG が必須(apple-touch-icon は src/app/apple-icon.png が自動リンク)。
 * PNG は scripts/generate-icons.mjs で public/logo.svg から生成する。
 * middleware の matcher で manifest.webmanifest は除外済み(未ログインでも取れる)。
 */
export function GET(request: Request): Response {
  const h = new URL(request.url).searchParams.get("h");
  const handoff = isHandoffToken(h) ? h : null;
  const manifest = {
    id: "/",
    name: "給与管理システム",
    short_name: "給与管理",
    lang: "ja",
    start_url: handoff ? `/?h=${handoff}` : "/",
    scope: "/",
    display: "standalone",
    background_color: "#152449",
    theme_color: "#152449",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      // 札付きは本人専用なので保存させない
      "Cache-Control": handoff ? "private, no-store" : "public, max-age=3600",
    },
  });
}
