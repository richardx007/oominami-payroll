/**
 * 労使合意の標準休憩時間帯(3枠)。深夜勤務で休憩をいつ取るかにより深夜割増が
 * 変わってしまう問題を避けるため、休憩はこの3つの時間帯に取る前提で計算する
 * (勤務時間・深夜勤務手当とも `lib/period.ts` の standardBreakMinutes()/nightMinutes()
 * がこの枠を使う)。既定値は 12:00-13:00 / 19:00-20:00 / 4:00-5:00 だが、
 * 設定画面(「シフト枠」の下の「休憩時間」)から変更できる。
 */

/** [開始, 終了) を0時からの分数で表す休憩時間帯 */
export type BreakWindow = [number, number];

export const DEFAULT_BREAK_WINDOWS: BreakWindow[] = [
  [12 * 60, 13 * 60],
  [19 * 60, 20 * 60],
  [4 * 60, 5 * 60],
];

/** app_settings のキー一覧(page から SELECT する用) */
export const BREAK_SETTING_KEYS = [1, 2, 3].flatMap((n) => [
  `break_window_${n}_start`,
  `break_window_${n}_end`,
]);

function parseHHMM(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** app_settings の key/value 配列から休憩時間帯3枠を組み立てる(未設定/不正値は既定にフォールバック) */
export function parseBreakWindows(
  rows: { key: string; value: string }[] | null | undefined
): BreakWindow[] {
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  const windows: BreakWindow[] = [];
  for (let i = 0; i < 3; i++) {
    const n = i + 1;
    const s = parseHHMM(map.get(`break_window_${n}_start`));
    const e = parseHHMM(map.get(`break_window_${n}_end`));
    windows.push(s !== null && e !== null && e > s ? [s, e] : DEFAULT_BREAK_WINDOWS[i]);
  }
  return windows;
}

/** 分(0-1439) を "HH:MM" に変換(フォームの defaultValue 表示用) */
export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
