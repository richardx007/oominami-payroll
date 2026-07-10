// public/logo.svg から PWA 用の PNG アイコンを生成する。
//
// iOS/Android のホーム画面・macOS Dock は SVG アイコンを使えないため PNG が必須。
// ロゴ(public/logo.svg)を差し替えたら `node scripts/generate-icons.mjs` を実行して
// 以下を再生成し、コミットすること:
//   - src/app/apple-icon.png (180x180)  … Next が apple-touch-icon として自動リンク
//   - public/icon-192.png / icon-512.png … manifest.ts が参照
//
// ビルド時ではなく手動実行にしているのは、デプロイ環境(Cloudflare)に sharp が
// 無くてもビルドが通るようにするため(生成物はリポジトリにコミット済み)。
import sharp from "sharp";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "public/logo.svg");
const white = { r: 255, g: 255, b: 255, alpha: 1 };

const targets = [
  { size: 180, out: "src/app/apple-icon.png" },
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
];

for (const { size, out } of targets) {
  await sharp(src, { density: 300 })
    .resize(size, size, { fit: "cover" })
    .flatten({ background: white })
    .png()
    .toFile(resolve(root, out));
  console.log(`[generate-icons] ${out} (${size}x${size})`);
}
