// 共通: パス・設定の読み込み・時刻の対応表（映像の時刻 ⇔ 実時間）
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FFMPEG = ffmpegPath;
export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const VOICEVOX_URL = process.env.VOICEVOX_URL || "http://127.0.0.1:50021";

export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** 動画ごとのフォルダ・設定・作業フォルダ */
export function movie(name) {
  const dir = join(ROOT, "movies", name);
  if (!existsSync(join(dir, "config.json"))) throw new Error(`movies/${name}/config.json がありません`);
  const config = readJson(join(dir, "config.json"));
  const work = join(ROOT, "work", name);
  mkdirSync(join(work, "nar"), { recursive: true });
  mkdirSync(join(ROOT, "out"), { recursive: true });
  return { name, dir, config, work, narration: readJson(join(dir, config.narration || "narration.json")) };
}

/** WAV（PCM）の長さ（秒） */
export function wavSeconds(file) {
  const b = readFileSync(file);
  const byteRate = b.readUInt32LE(28);
  // "data" チャンクを探す（VOICEVOX の WAV は先頭44バイトとは限らない）
  let p = 12;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === "data") return size / byteRate;
    p += 8 + size;
  }
  throw new Error(`WAV の data が見つかりません: ${file}`);
}

/** 区分線形の対応表 pts=[[映像の時刻 v, 実時間 r], ...] */
export function toReal(warp, v) {
  const P = warp.pts;
  for (let i = 1; i < P.length; i++)
    if (v <= P[i][0]) {
      const [v0, r0] = P[i - 1], [v1, r1] = P[i];
      return r0 + (r1 - r0) * ((v - v0) / (v1 - v0 || 1));
    }
  return warp.total;
}
export function toVideo(warp, r) {
  const P = warp.pts;
  for (let i = 1; i < P.length; i++)
    if (r <= P[i][1]) {
      const [v0, r0] = P[i - 1], [v1, r1] = P[i];
      return v0 + (v1 - v0) * ((r - r0) / (r1 - r0 || 1));
    }
  return P[P.length - 1][0];
}
