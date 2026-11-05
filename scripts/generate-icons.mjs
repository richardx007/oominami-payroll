// public/logo.svg から PWA 用の PNG アイコンを生成する。
//
// iOS/Android のホーム画面・macOS Dock は SVG アイコンを使えないため PNG が必須。
// ロゴ(public/logo.svg)を差し替えたら `node scripts/generate-icons.mjs` を実行して
// 以下を再生成し、コミットすること:
//   - src/app/apple-icon.png (180x180)  … Next が apple-touch-icon として自動リンク
//   - public/icon-192.png / icon-512.png … manifest.ts が参照
//   - public/logo-240.png               … 画面に出すロゴ(ヘッダー・/install)。logo.svg は中身が
//                                          2000px の PNG で約 390KB もあり、起動時に表示が間に合わないため
//   - src/app/icon.png                 … ファビコン(logo-240.png と同じもの)
//   - src/app/splash-logo.ts            … 起動ロゴ(Splash)に埋め込む同じ画像(data URI)。
//                                          別ファイルの読み込みを待たずに最初の描画でロゴが出るようにする
//
// ビルド時ではなく手動実行にしているのは、デプロイ環境(Cloudflare)に sharp が
// 無くてもビルドが通るようにするため(生成物はリポジトリにコミット済み)。
import sharp from "sharp";
import { writeFileSync } from "node:fs";
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

// 画面表示用の小さなロゴ(240px = 80px 表示の 3 倍。色数を減らして約 9KB)
const logo = await sharp(src, { density: 300 })
  .resize(240, 240, { fit: "cover" })
  .flatten({ background: white })
  .png({ palette: true, compressionLevel: 9 })
  .toBuffer();
writeFileSync(resolve(root, "public/logo-240.png"), logo);
// ファビコン(Next が src/app/icon.png を自動リンク)。以前の src/app/icon.svg は logo.svg と同じ 390KB だった
writeFileSync(resolve(root, "src/app/icon.png"), logo);
console.log(`[generate-icons] public/logo-240.png (240x240, ${logo.length} bytes)`);
writeFileSync(
  resolve(root, "src/app/splash-logo.ts"),
  "// scripts/generate-icons.mjs が public/logo.svg から生成する(手で直さない)。\n" +
    "// 起動ロゴ(Splash)用。画像の読み込みを待たずに最初の描画でロゴを出すため data URI で埋め込む。\n" +
    `export const SPLASH_LOGO = "data:image/png;base64,${logo.toString("base64")}";\n`
);
console.log("[generate-icons] src/app/splash-logo.ts");
