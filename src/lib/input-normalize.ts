/**
 * 数値・時刻の入力欄の文字を整える(部品は `src/components/NumericInput.tsx` / `TimeInput.tsx`)。
 *
 * - 全角→半角: PC/Mac で日本語入力(かなモード)のまま打たれた「１２３」「９：００」を半角に直す。
 *   かなモードでは . が「。」、- が「ー」になるので、それも戻す(家計簿アプリ kakeibo と同じ考え方)。
 * - 時刻: ":" を打たなくても読む。「900」→9:00、「2300」→23:00、「9」→9:00(biz-management と同じ操作感)。
 */

/** 全角の数字・記号を半角にする(数値・時刻の欄用) */
export function toHalfWidthNumeric(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ":")
    .replace(/[．。]/g, ".")
    .replace(/[，、]/g, ",")
    .replace(/[ーｰ－−‐]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/[　]/g, " ");
}

/**
 * 数値欄の値を半角にし、使えない文字を落とす。
 * 既定は数字だけ。マイナス・小数点・ハイフン(郵便番号)は指定したときだけ残す。
 */
export function sanitizeNumeric(
  s: string,
  opts: { negative?: boolean; decimal?: boolean; hyphen?: boolean } = {}
): string {
  const keep = `0-9${opts.decimal ? "." : ""}${opts.negative || opts.hyphen ? "\\-" : ""}`;
  return toHalfWidthNumeric(s).replace(new RegExp(`[^${keep}]`, "g"), "");
}

/** 時刻欄の値を半角にし、数字と ":" 以外を落とす(入力途中に使う) */
export function sanitizeTime(s: string): string {
  return toHalfWidthNumeric(s).replace(/[^0-9:]/g, "");
}

/**
 * 時刻の入力 → 分。読めなければ null。
 * 「9:00」「09:00」のほか ":" なしも読む: 1〜2桁は「時」(9→9:00、23→23:00)、
 * 3〜4桁は末尾2桁を「分」(900→9:00、2300→23:00、1530→15:30)。
 * maxMinutes(既定 23:59)を超える値、分が 60 以上の値は null。
 */
export function parseTimeText(text: string, maxMinutes = 23 * 60 + 59): number | null {
  const s = sanitizeTime(text.trim());
  if (!s) return null;
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    m = 0;
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, -2));
    m = Number(s.slice(-2));
  } else {
    return null;
  }
  if (m > 59) return null;
  const total = h * 60 + m;
  return total > maxMinutes ? null : total;
}

/** 分 → 「9:00」(pad=true なら「09:00」) */
export function formatTimeMinutes(min: number, pad = false): string {
  const h = String(Math.floor(min / 60));
  return `${pad ? h.padStart(2, "0") : h}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * 時刻欄の値を整える。読めればそろえた表記、読めなければ(半角にしただけで)そのまま返す。
 * 読めない値を消さないのは、保存時のチェックで赤く知らせて本人に直してもらうため。
 */
export function normalizeTimeText(text: string, opts: { maxMinutes?: number; pad?: boolean } = {}): string {
  const min = parseTimeText(text, opts.maxMinutes);
  return min == null ? sanitizeTime(text.trim()) : formatTimeMinutes(min, opts.pad);
}
