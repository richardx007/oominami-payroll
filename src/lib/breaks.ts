/**
 * 労使合意の標準休憩時間帯(3枠)。深夜勤務で休憩をいつ取るかにより深夜割増が
 * 変わってしまう問題を避けるため、休憩はこの3つの時間帯に取る前提で計算する
 * (勤務時間・深夜勤務手当とも `lib/period.ts` の standardBreakMinutes()/nightMinutes()
 * がこの枠を使う)。既定値は 12:00-13:00 / 19:00-20:00 / 4:00-5:00 だが、
 * 管理画面「営業と勤務時間」から適用開始日ごとに変更できる(`lib/work-time.ts`)。
 */

/** [開始, 終了) を0時からの分数で表す休憩時間帯 */
export type BreakWindow = [number, number];

export const DEFAULT_BREAK_WINDOWS: BreakWindow[] = [
  [12 * 60, 13 * 60],
  [19 * 60, 20 * 60],
  [4 * 60, 5 * 60],
];

/**
 * 休憩時間帯の指定。固定の3枠か、勤務日 → その日の3枠(適用開始日で変わるため)。
 * 期間をまたいで計算する側(給与・日報など)は関数で渡す。
 */
export type BreakWindowsSource = BreakWindow[] | ((workDate: string) => BreakWindow[]);

/** 勤務日の休憩時間帯を取り出す */
export function windowsOn(src: BreakWindowsSource, workDate: string): BreakWindow[] {
  return typeof src === "function" ? src(workDate) : src;
}

function parseHHMM(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** key/value 配列(その日に有効な work_time_settings)から休憩時間帯3枠を組み立てる(未設定/不正値は既定にフォールバック) */
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
