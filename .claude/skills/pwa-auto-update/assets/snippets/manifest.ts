// app/manifest.ts — Next.js の Metadata Files 機能で /manifest.webmanifest を配信する。
// これを置くと layout の metadata に自動で <link rel="manifest"> が挿入される。
// icons は各アプリのロゴに合わせて差し替える(PNG 推奨。SVG は maskable 用途に不向き)。
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "アプリ名",
    short_name: "アプリ",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    background_color: "#152449",
    theme_color: "#152449",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
