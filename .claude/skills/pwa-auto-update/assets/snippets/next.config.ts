// next.config.ts への追記サンプル(要点は @serwist/next で既存 config をラップすること)。
// 既存の nextConfig を withSerwist(...) で包んで export する。
//
// 事前に:  npm i -D @serwist/next serwist
//          npm i @serwist/window          ← ReloadPrompt が使う(ランタイム依存)
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // …既存の設定はそのまま…
};

const withSerwist = withSerwistInit({
  // SW のソースと出力先。ReloadPrompt の swUrl 既定 '/sw.js' と一致させる。
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // 登録は ReloadPrompt(@serwist/window)側に一本化するため自動登録は無効化。
  // これにより「新版検知 → バナー → ワンタップ更新」のフローを制御できる。
  register: false,
  // 開発中に SW を有効にすると更新検証がややこしいので既定では無効(必要なら true)。
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);

// 補足(Cloudflare Workers / @opennextjs/cloudflare):
//  - swDest を public/sw.js にすると静的アセットとして配信される。ビルド後に
//    .open-next の出力へ public/sw.js が含まれているか、実機で /sw.js が 200 で
//    返るか(Content-Type: application/javascript、Service-Worker-Allowed 不要)を確認する。
//  - SW の scope をサイト全体('/')にするため sw.js はサイトルート直下に置くこと。
