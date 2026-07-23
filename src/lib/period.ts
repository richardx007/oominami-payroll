/**
 * 給与計算期間: 前月26日 〜 当月25日(25日締め・月末払い)
 * 期間キーは締め月の "YYYY-MM" で表す(例: 2026-07 → 6/26〜7/25、7月分)
 */

import { DEFAULT_BREAK_WINDOWS, type BreakWindow } from "./breaks";

export type Period = {
  key: string; // "YYYY-MM"(締め月)
  label: string; // "2026年7月分"
  start: string; // "YYYY-MM-DD"(前月26日)
  end: string; // "YYYY-MM-DD"(当月25日)
  paymentDate: string; // 当月末日
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 締め月(year, month)の期間を返す */
export function periodOf(year: number, month: number): Period {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    key: `${year}-${pad(month)}`,
    label: `${year}年${month}月分`,
    start: ymd(prevYear, prevMonth, 26),
    end: ymd(year, month, 25),
    paymentDate: ymd(year, month, lastDay),
  };
}

/** "YYYY-MM" 形式のキーから期間を返す(不正値は null) */
export function periodFromKey(key: string): Period | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return periodOf(year, month);
}

/** 今日が属する期間(日本時間ベース) */
export function currentPeriod(now: Date = new Date()): Period {
  // JST に変換
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let year = jst.getUTCFullYear();
  let month = jst.getUTCMonth() + 1;
  if (jst.getUTCDate() > 25) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periodOf(year, month);
}

/** 今日の日付(日本時間, "YYYY-MM-DD") */
export function todayJST(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** 現在時刻(JST)の "HH:MM"。QR打刻の打刻時刻に使う */
export function nowTimeJST(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(11, 16);
}

/** 前後の期間キー */
export function adjacentPeriodKey(key: string, diff: 1 | -1): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)!;
  let year = Number(m[1]);
  let month = Number(m[2]) + diff;
  if (month > 12) {
    month = 1;
    year += 1;
  } else if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${pad(month)}`;
}

/** 期間内の日付一覧("YYYY-MM-DD") */
export function datesInPeriod(period: Period): string[] {
  const dates: string[] = [];
  const d = new Date(period.start + "T00:00:00Z");
  const end = new Date(period.end + "T00:00:00Z");
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/** 勤務時間(分)を計算 */
export function workMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: number
): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  // 退勤が出勤以前(例: 22:00→2:00)は翌日にまたぐ勤務とみなし24時間を加算する
  if (diff <= 0) diff += 24 * 60;
  return Math.max(0, diff - breakMinutes);
}

// 深夜帯 = 22:00(1320分)〜翌5:00(1740分=29:00)
const NIGHT_BAND: [number, number] = [22 * 60, 29 * 60];

function overlapLen(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** 出退勤時刻から勤務区間 [開始, 終了) を分で返す(日跨ぎは終了に24時間加算) */
function shiftRange(startTime: string, endTime: string): [number, number] {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60;
  return [start, end];
}

/**
 * 標準休憩ルールに基づく休憩分数。勤務区間に重なる標準休憩帯(windows。既定は
 * 12:00-13:00/19:00-20:00/4:00-5:00、設定画面「休憩時間」で変更可)の合計。
 * 例: 10:00〜18:00 は 12:00-13:00 に重なり 60分、21:00〜翌6:00 は 4:00-5:00 に重なり 60分。
 */
export function standardBreakMinutes(
  startTime: string,
  endTime: string,
  windows: BreakWindow[] = DEFAULT_BREAK_WINDOWS
): number {
  const [start, end] = shiftRange(startTime, endTime);
  let total = 0;
  for (const [w0, w1] of windows) {
    for (let k = -1; k <= 1; k++) {
      total += overlapLen(start, end, w0 + k * 1440, w1 + k * 1440);
    }
  }
  return total;
}

/**
 * 深夜勤務手当の対象分数。深夜帯(22:00〜翌5:00)の勤務から、標準休憩帯(windows)ぶんを差し引く。
 * これにより「4:00〜5:00 の休憩は深夜帯に取る」前提で深夜割増時間が一意に定まる
 * (休憩を深夜帯のどこで取るかによって支給が変わる問題を防ぐ)。
 */
export function nightMinutes(
  startTime: string,
  endTime: string,
  windows: BreakWindow[] = DEFAULT_BREAK_WINDOWS
): number {
  const [start, end] = shiftRange(startTime, endTime);
  let total = 0;
  for (let k = -1; k <= 1; k++) {
    const b0 = NIGHT_BAND[0] + k * 1440;
    const b1 = NIGHT_BAND[1] + k * 1440;
    const nightOverlap = overlapLen(start, end, b0, b1);
    if (nightOverlap <= 0) continue;
    // この深夜帯に取る標準休憩(勤務区間かつ深夜帯に重なる休憩)を差し引く
    let breakInNight = 0;
    for (const [w0, w1] of windows) {
      for (let j = -1; j <= 1; j++) {
        const lo = Math.max(start, b0, w0 + j * 1440);
        const hi = Math.min(end, b1, w1 + j * 1440);
        if (hi > lo) breakInNight += hi - lo;
      }
    }
    total += nightOverlap - breakInNight;
  }
  return total;
}

export function formatMinutes(min: number): string {
  return `${Math.floor(min / 60)}時間${min % 60 > 0 ? `${min % 60}分` : ""}`;
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" の曜日(日=0) */
export function weekdayOf(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/** 交通区間を「区間1 ⇔/→ 区間2」形式で表す(往復=⇔ / 片道=→)。駅未入力なら空文字 */
export function formatRoute(
  stationFrom: string | null,
  stationTo: string | null,
  roundTrip: boolean
): string {
  if (!stationFrom && !stationTo) return "";
  const arrow = roundTrip ? "⇔" : "→";
  return `${stationFrom ?? ""} ${arrow} ${stationTo ?? ""}`.trim();
}
