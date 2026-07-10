import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

const withSerwist = withSerwistInit({
  // SW のソースと出力先。ReloadPrompt の swUrl 既定 '/sw.js' と一致させる。
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // 登録は ReloadPrompt(@serwist/window)側に一本化するため自動登録は無効化。
  // これで「新版検知 → バナー → ワンタップ更新」を制御できる。
  register: false,
  // 開発中は SW を無効化(更新検証がややこしくなるため)。
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
