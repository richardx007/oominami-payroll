// 使い方: node lib/build.mjs <動画フォルダ名> [手順...]
//   手順を省略すると全部: kana → voice → warp → bgm → track → video → mix → light
//   例) node lib/build.mjs eigyo-calendar kana      … 読み（カナ）だけ確認
//       node lib/build.mjs eigyo-calendar video mix … 映像だけ作り直して合成（音声は前回のもの）
// 出力: out/<config.output>.mp4（高画質）と out/<config.output>_アプリ登録用.mp4（軽量・作成日時入り）
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { movie, readJson, ROOT } from "./common.mjs";
import { engineVersion, narrate } from "./narrate.mjs";
import { makeWarp } from "./warp.mjs";
import { makeBgm } from "./bgm.mjs";
import { light, mix, narrationTrack, renderVideo } from "./render.mjs";

const ALL = ["kana", "voice", "warp", "bgm", "track", "video", "mix", "light"];
const [name, ...args] = process.argv.slice(2);
if (!name) {
  console.error("使い方: node lib/build.mjs <動画フォルダ名> [kana|voice|warp|bgm|track|video|mix|light ...]");
  process.exit(1);
}
const steps = args.length ? args : ALL;
const m = movie(name);
const W = (f) => join(m.work, f);
const OUT = join(ROOT, "out", m.config.output);

// VOICEVOX エンジン: 動いていなければ voicevox/engine/run を起動して、終わったら止める
let engine = null;
async function ensureEngine() {
  if (await engineVersion()) return;
  const run = process.env.VOICEVOX_ENGINE || join(ROOT, "voicevox", "engine", "run");
  if (!existsSync(run)) throw new Error(`VOICEVOX エンジンがありません（${run}）。README の「準備」を参照`);
  console.log("VOICEVOX エンジンを起動します…");
  engine = spawn(run, ["--host", "127.0.0.1", "--port", "50021"], { stdio: "ignore" });
  for (let i = 0; i < 90; i++) {
    if (await engineVersion()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("VOICEVOX エンジンが起動しませんでした");
}

try {
  let warp = existsSync(W("warp.json")) ? readJson(W("warp.json")) : null;
  for (const s of steps) {
    console.log(`▶ ${s}`);
    if (s === "kana" || s === "voice") {
      await ensureEngine();
      await narrate(m, { kanaOnly: s === "kana" });
    } else if (s === "warp") {
      warp = makeWarp(m);
      console.log(`  全体 ${warp.total.toFixed(1)} 秒`);
    } else if (s === "bgm") makeBgm(m, warp);
    else if (s === "track") narrationTrack(m, warp, W("narration.wav"));
    else if (s === "video") await renderVideo(m, warp, W("video.mp4"));
    else if (s === "mix") mix(W("video.mp4"), W("bgm.wav"), W("narration.wav"), `${OUT}.mp4`);
    else if (s === "light") light(`${OUT}.mp4`, `${OUT}_アプリ登録用.mp4`);
    else throw new Error(`知らない手順: ${s}（${ALL.join(" / ")}）`);
  }
  if (steps.includes("mix") || steps.includes("light")) console.log(`完成: out/${m.config.output}.mp4 ほか`);
} finally {
  if (engine) engine.kill();
}

