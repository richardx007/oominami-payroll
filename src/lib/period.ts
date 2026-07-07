/**
 * 給与計算期間: 前月26日 〜 当月25日(25日締め・月末払い)
 * 期間キーは締め月の "YYYY-MM" で表す(例: 2026-07 → 6/26〜7/25、7月分)
 */

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
  return Math.max(0, eh * 60 + em - (sh * 60 + sm) - breakMinutes);
}

export function formatMinutes(min: number): string {
  return `${Math.floor(min / 60)}時間${min % 60 > 0 ? `${min % 60}分` : ""}`;
}
