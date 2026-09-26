// ナレーション: VOICEVOX（ずんだもん ノーマル）で原稿を1文ずつ合成する。辞書（dictionary.json）も登録する
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, ROOT, VOICEVOX_URL } from "./common.mjs";

export const SPEAKER = 3; // ずんだもん（ノーマル）
const TUNING = { speedScale: 1.12, intonationScale: 1.15, prePhonemeLength: 0.05, postPhonemeLength: 0.1, outputSamplingRate: 48000 };

export async function engineVersion() {
  try {
    const r = await fetch(`${VOICEVOX_URL}/version`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** dictionary.json の語をユーザー辞書に登録（同じ表記があれば読み・アクセントを更新） */
export async function registerDictionary() {
  const words = readJson(join(ROOT, "dictionary.json"));
  const current = await (await fetch(`${VOICEVOX_URL}/user_dict`)).json();
  for (const w of words) {
    const q = new URLSearchParams({ surface: w.surface, pronunciation: w.pronunciation, accent_type: String(w.accent_type), word_type: "COMMON_NOUN", priority: "9" });
    const hit = Object.entries(current).find(([, v]) => v.surface === w.surface || v.surface === w.surface.normalize("NFKC"));
    const res = hit
      ? await fetch(`${VOICEVOX_URL}/user_dict_word/${hit[0]}?${q}`, { method: "PUT" })
      : await fetch(`${VOICEVOX_URL}/user_dict_word?${q}`, { method: "POST" });
    if (!res.ok) throw new Error(`辞書登録に失敗: ${w.surface}（${res.status}）`);
  }
}

/**
 * 原稿（[[開始, 終了, 文], ...]）を合成して work/<動画>/nar/NN.wav に書く。kanaOnly なら読み（カナ）だけ表示する。
 * 「通しの日と」の「ひ」のように無声化した「ヒ」は「人（ひと）」に聞こえるので、母音を有声に書き換える。
 */
export async function narrate(m, { kanaOnly = false } = {}) {
  await registerDictionary();
  for (let i = 0; i < m.narration.length; i++) {
    const text = m.narration[i][2];
    const q = await (await fetch(`${VOICEVOX_URL}/audio_query?speaker=${SPEAKER}&text=${encodeURIComponent(text)}`, { method: "POST" })).json();
    console.log(String(i).padStart(2), q.kana);
    if (kanaOnly) continue;
    for (const ph of q.accent_phrases)
      ph.moras.forEach((mo, j) => {
        if (mo.text === "ヒ" && mo.vowel === "I") {
          mo.vowel = "i";
          mo.pitch = (ph.moras[j - 1] || ph.moras[j + 1])?.pitch || 5.9;
        }
      });
    Object.assign(q, TUNING);
    const wav = await (await fetch(`${VOICEVOX_URL}/synthesis?speaker=${SPEAKER}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) })).arrayBuffer();
    writeFileSync(join(m.work, "nar", `${String(i).padStart(2, "0")}.wav`), Buffer.from(wav));
  }
}
