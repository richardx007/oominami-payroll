import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Serwist が生成する Service Worker(minified)。lint 対象外。
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
    // opennextjs-cloudflare のビルド出力（デプロイのたびに作られる。lint すると巨大でメモリ不足になる）
    ".open-next/**",
    ".wrangler/**",
    // 解説動画の制作ツール（アプリとは別の Node スクリプトと HTML。tools/guide-movies/README.md）
    "tools/**",
  ]),
]);

export default eslintConfig;
