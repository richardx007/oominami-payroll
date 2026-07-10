import type { MetadataRoute } from "next";

// /manifest.webmanifest として配信され、layout の metadata に <link rel="manifest"> が自動挿入される。
// アイコンは現状 public/logo.svg を使用。将来 PNG(192/512)を用意したら差し替える。
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
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
