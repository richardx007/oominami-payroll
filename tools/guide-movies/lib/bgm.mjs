// BGM: 自作の合成音（外部音源なし。112BPM・明るいポップ、コード進行 IV-V-iii-vi）
// 楽器の出入りは config.json の "bgm" で映像の時刻（v）で指定する:
//   full:   [[開始, 終了], ...]           … ドラム・ベースを鳴らす区間（終了 null は最後まで）
//   arp:    [[開始, 終了, フェード秒], ...] … アルペジオを鳴らす区間
//   riser:  v | null                      … この時刻に向けて2秒間ノイズが高まる（場面転換の前）
//   cymbal: v | null                      … この時刻にシンバル（場面転換の後）
// パッド（和音）は常に鳴らす。最後の3.5秒でフェードアウト。
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { toReal } from "./common.mjs";

export function makeBgm(m, warp) {
  const cfg = m.config.bgm;
  const VR = (v) => toReal(warp, v);
  const SR = 44100, DUR = warp.total, N = Math.round(SR * DUR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const BPM = 112, BEAT = 60 / BPM, BAR = BEAT * 4;
  const mtof = (x) => 440 * Math.pow(2, (x - 69) / 12);
  const CHORDS = [
    [53, 57, 60, 64], // Fmaj7
    [55, 59, 62, 67], // G
    [52, 55, 59, 62], // Em7
    [57, 60, 64, 69], // Am
  ];
  const ROOTS = [41, 43, 40, 45];
  const smooth = (t, a, b, fade = 0.6) => Math.min(1, Math.max(0, (t - a) / fade)) * Math.min(1, Math.max(0, (b - t) / fade));
  const span = ([a, b, fade]) => [VR(a), b == null ? DUR : VR(b), fade];
  const FULLS = cfg.full.map(span), ARPS = cfg.arp.map(span);
  const FULL = (t) => Math.max(0, ...FULLS.map(([a, b]) => smooth(t, a, b)));
  const ARP = (t) => Math.max(0, ...ARPS.map(([a, b, f]) => smooth(t, a, b, f ?? 0.6)));
  const PAD = (t) => smooth(t, 0, DUR, 1.5);
  const add = (buf, i, v) => { if (i >= 0 && i < N) buf[i] += v; };

  // パッド: デチューンした三角波＋一次ローパス
  {
    let lpL = 0, lpR = 0;
    const ph = new Float64Array(8);
    for (let i = 0; i < N; i++) {
      const t = i / SR, ch = CHORDS[Math.floor(t / BAR) % 4];
      let sL = 0, sR = 0;
      for (let k = 0; k < 4; k++)
        for (let d = 0; d < 2; d++) {
          const j = k * 2 + d;
          ph[j] = (ph[j] + (mtof(ch[k]) * (d ? 1.004 : 0.996)) / SR) % 1;
          const tri = 1 - 4 * Math.abs(ph[j] - 0.5);
          if (d) sR += tri; else sL += tri;
        }
      lpL += 0.06 * (sL - lpL); lpR += 0.06 * (sR - lpR);
      const g = 0.05 * PAD(t) * (0.85 + 0.15 * Math.sin(t * 0.8));
      L[i] += lpL * g; R[i] += lpR * g;
    }
  }
  // プラック（アルペジオ）＋ピンポンディレイ
  {
    const arpL = new Float32Array(N), arpR = new Float32Array(N);
    const PAT = [0, 1, 2, 3, 2, 1, 3, 2], step = BEAT / 2;
    for (let s = 0; s * step < DUR; s++) {
      const t0 = s * step, lvl = ARP(t0);
      if (lvl <= 0) continue;
      const f = mtof(CHORDS[Math.floor(t0 / BAR) % 4][PAT[s % 8]] + 12 + (s % 16 === 14 ? 12 : 0));
      const pan = s % 2 ? 0.35 : -0.35;
      for (let j = 0; j < 0.35 * SR; j++) {
        const tt = j / SR, env = Math.exp(-tt * 14) * Math.min(1, tt * 400);
        const v = (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt)) * env * 0.09 * lvl;
        add(arpL, Math.round(t0 * SR) + j, v * (1 - pan));
        add(arpR, Math.round(t0 * SR) + j, v * (1 + pan));
      }
    }
    const D = Math.round(BEAT * 0.75 * SR);
    for (let i = D; i < N; i++) { arpL[i] += arpR[i - D] * 0.35; arpR[i] += arpL[i - D] * 0.35; }
    for (let i = 0; i < N; i++) { L[i] += arpL[i]; R[i] += arpR[i]; }
  }
  // ベース（8分・オクターブ跳ね）
  {
    const step = BEAT / 2;
    for (let s = 0; s * step < DUR; s++) {
      const t0 = s * step, lvl = FULL(t0);
      if (lvl <= 0) continue;
      const f = mtof(ROOTS[Math.floor(t0 / BAR) % 4] - 12 + (s % 2 ? 12 : 0));
      let ph = 0;
      for (let j = 0; j < step * 0.9 * SR; j++) {
        const tt = j / SR, env = Math.min(1, tt * 200) * Math.exp(-tt * 5);
        ph += f / SR;
        const v = Math.tanh(1.8 * Math.sin(2 * Math.PI * ph)) * env * 0.16 * lvl;
        add(L, Math.round(t0 * SR) + j, v); add(R, Math.round(t0 * SR) + j, v);
      }
    }
  }
  // ドラム: キック（4つ打ち）・裏拍のハット・2拍4拍のクラップ
  let seed = 1;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let b = 0; b * BEAT < DUR; b++) {
    const t0 = b * BEAT, lvl = FULL(t0);
    if (lvl <= 0) continue;
    let ph = 0;
    for (let j = 0; j < 0.3 * SR; j++) {
      const tt = j / SR;
      ph += (50 + 110 * Math.exp(-tt * 30)) / SR;
      const v = Math.sin(2 * Math.PI * ph) * Math.exp(-tt * 9) * 0.32 * lvl;
      add(L, Math.round(t0 * SR) + j, v); add(R, Math.round(t0 * SR) + j, v);
    }
    const th = t0 + BEAT / 2;
    let hp = 0, prev = 0;
    for (let j = 0; j < 0.06 * SR; j++) {
      const n = rnd(); hp = 0.9 * (hp + n - prev); prev = n;
      const v = hp * Math.exp(-(j / SR) * 60) * 0.05 * lvl;
      add(L, Math.round(th * SR) + j, v * 0.8); add(R, Math.round(th * SR) + j, v * 1.2);
    }
    if (b % 2 === 1)
      for (let j = 0; j < 0.15 * SR; j++) {
        const tt = j / SR, n = rnd();
        const env = Math.exp(-tt * 25) * (tt < 0.02 ? 0.6 + 0.4 * Math.sin(tt * 900) : 1);
        const v = n * env * 0.07 * lvl;
        add(L, Math.round(t0 * SR) + j, v); add(R, Math.round(t0 * SR) + j, v);
      }
  }
  // 場面転換: 高まるノイズとシンバル
  if (cfg.riser != null) {
    let hp = 0, prev = 0;
    const r0 = VR(cfg.riser) - 2;
    for (let t = r0; t < r0 + 2; t += 1 / SR) {
      const i = Math.round(t * SR), n = rnd(); hp = 0.95 * (hp + n - prev); prev = n;
      const g = Math.pow((t - r0) / 2, 2) * 0.06;
      add(L, i, hp * g); add(R, i, hp * g);
    }
  }
  if (cfg.cymbal != null)
    for (let j = 0; j < 1.6 * SR; j++) {
      const v = rnd() * Math.exp(-(j / SR) * 3) * 0.05;
      add(L, Math.round(VR(cfg.cymbal) * SR) + j, v); add(R, Math.round(VR(cfg.cymbal) * SR) + j, v);
    }
  // フェード・正規化・WAV
  const fadeIn = 0.4 * SR, fadeOut = 3.5 * SR;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut);
    L[i] = Math.tanh(L[i] * g * 1.1); R[i] = Math.tanh(R[i] * g * 1.1);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = 0.8 / peak, wav = Buffer.alloc(44 + N * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    wav.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4);
  }
  const out = join(m.work, "bgm.wav");
  writeFileSync(out, wav);
  return out;
}
