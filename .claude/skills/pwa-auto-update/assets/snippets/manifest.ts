import type { MetadataRoute } from "next";

// app/manifest.ts — /manifest.webmanifest として配信され、layout の metadata に
// <link rel="manifest"> が自動挿入される。name/色/アイコンは各アプリに合わせて差し替える。
// アイコンは PNG(192/512) が理想。SVG でも可(下記は SVG ロゴを流用する例)。
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
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
