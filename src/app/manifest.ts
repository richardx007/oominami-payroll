import type { MetadataRoute } from "next";

// /manifest.webmanifest として配信され、layout の metadata に <link rel="manifest"> が自動挿入される。
// アイコンは PNG(public/icon-192.png / icon-512.png)を使用。iOS/Android のホーム画面・Dock は
// SVG アイコンを使えないため PNG が必須(apple-touch-icon は src/app/apple-icon.png が自動リンク)。
// PNG は scripts/generate-icons.mjs で public/logo.svg から生成する。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "給与管理システム",
    short_name: "給与管理",
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
