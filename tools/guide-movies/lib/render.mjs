// 映像の書き出しと音声の合成
import { spawn, execFileSync } from "node:child_process";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { CHROME, FFMPEG, toVideo } from "./common.mjs";

export async function openMovie(m) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`file://${join(m.dir, m.config.html)}?render`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return { browser, page, errors };
}

/** 実時間で 30fps のコマを撮り、ffmpeg で H.264（音なし）にする */
export async function renderVideo(m, warp, out) {
  const FPS = 30;
  const { browser, page, errors } = await openMovie(m);
  const ff = spawn(FFMPEG, ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  ff.stderr.on("data", (d) => (err += d));
  const n = Math.round(warp.total * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.renderAt(t), toVideo(warp, i / FPS));
    const buf = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 600 === 0) console.log(`  コマ ${i}/${n}`);
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  await browser.close();
  if (errors.length) throw new Error("ページのエラー: " + errors.join(" / "));
  if (code !== 0) throw new Error("ffmpeg に失敗: " + err.split("\n").slice(-5).join("\n"));
}

/** ナレーションの各文を対応表の位置に並べた1本の音声 */
export function narrationTrack(m, warp, out) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  warp.clips.forEach((c) => args.push("-i", c.f));
  const f =
    warp.clips.map((c, i) => `[${i}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[a${i}]`).join(";") +
    ";" + warp.clips.map((c, i) => `[a${i}]`).join("") + `amix=inputs=${warp.clips.length}:normalize=0,apad=whole_dur=${warp.total}[out]`;
  execFileSync(FFMPEG, [...args, "-filter_complex", f, "-map", "[out]", "-t", String(warp.total), out], { stdio: "inherit" });
}

/** 映像＋BGM＋ナレーション。ナレーション中は BGM を自動で下げ、全体を −16 LUFS に */
export function mix(video, bgm, narration, out) {
  const f =
    "[1:a]aresample=48000,volume=0.3[b];[2:a]volume=1.6,asplit=2[n1][sc];" +
    "[b][sc]sidechaincompress=threshold=0.03:ratio=4:attack=30:release=600[bd];" +
    "[bd][n1]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]";
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", bgm, "-i", narration, "-filter_complex", f,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], { stdio: "inherit" });
}

/**
 * アプリ登録用: 約1/3に軽量化し、作成日時を埋め込む（アプリはアップロード時に mvhd の作成日時を読む。
 * ffmpeg は指定しないと 0 を書くので必ず付ける）
 */
export function light(src, out, createdAt = new Date()) {
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-tune", "animation",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-metadata", `creation_time=${createdAt.toISOString()}`, "-movflags", "+faststart", out], { stdio: "inherit" });
}
