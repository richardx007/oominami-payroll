// 時間配分: ナレーションの長さに合わせて映像の時刻 v を実時間 r に引き伸ばす対応表を作る
// 原稿の各文には「映像のこの区間で話す」[開始, 終了] がある。文が区間に収まらないときは、その区間だけ映像を伸ばす
// （区間の間はそのまま）。映像は renderAt(v) で描くので、実時間 r のコマは v = toVideo(r) を描けばよい。
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { wavSeconds } from "./common.mjs";

const PAD = 0.3; // 文の後の間
const TAIL = 0.5; // 最後の余韻

export function makeWarp(m) {
  const end = m.config.end;
  const pts = [[0, 0]], clips = [];
  let v = 0, r = 0;
  m.narration.forEach(([s, e], i) => {
    const f = join(m.work, "nar", `${String(i).padStart(2, "0")}.wav`);
    const d = wavSeconds(f);
    r += s - v; v = s; pts.push([v, r]);
    clips.push({ f, at: r, d });
    r += Math.max(e - s, d + PAD); v = e; pts.push([v, r]);
  });
  r += end - v + TAIL; pts.push([end, r]);
  const warp = { pts, clips, total: r };
  writeFileSync(join(m.work, "warp.json"), JSON.stringify(warp, null, 1));
  return warp;
}
