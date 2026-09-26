// 使い方: node lib/snap.mjs <動画フォルダ名> <映像の時刻(秒)> [...]
// 指定した時刻のコマを work/<動画>/snap/<時刻>.png に書き出す（見た目の確認用。音声は不要）。
// 4枚ずつ 2×2 にまとめた一覧 work/<動画>/snap/sheet-N.jpg も作る。
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { FFMPEG, movie } from "./common.mjs";
import { openMovie } from "./render.mjs";

const [name, ...ts] = process.argv.slice(2);
const m = movie(name);
const dir = join(m.work, "snap");
mkdirSync(dir, { recursive: true });
const { browser, page, errors } = await openMovie(m);
const files = [];
for (const t of ts.map(Number)) {
  // 指やカメラの位置は直前の描画を使うので、少し前から順に進める
  for (let x = Math.max(0, t - 3); x < t; x += 0.25) await page.evaluate((v) => window.renderAt(v), x);
  await page.evaluate((v) => window.renderAt(v), t);
  const f = join(dir, `${String(t).replace(".", "_")}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
for (let i = 0; i < files.length; i += 4) {
  const four = files.slice(i, i + 4);
  while (four.length < 4) four.push(four[four.length - 1]);
  execFileSync(FFMPEG, ["-loglevel", "error", "-y", ...four.flatMap((f) => ["-i", f]), "-filter_complex",
    "[0]scale=960:-1[a];[1]scale=960:-1[b];[2]scale=960:-1[c];[3]scale=960:-1[d];[a][b]hstack[x];[c][d]hstack[y];[x][y]vstack",
    "-frames:v", "1", join(dir, `sheet-${i / 4 + 1}.jpg`)]);
}
console.log(errors.length ? "ページのエラー: " + errors.join(" / ") : `書き出し: ${dir}`);
