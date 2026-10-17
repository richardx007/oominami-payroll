/**
 * 日本時間(Asia/Tokyo)の日付・時刻の書式。
 *
 * `toLocaleString("ja-JP", { timeZone, ... })` や `new Intl.DateTimeFormat(...)` は呼ぶたびに
 * 書式の準備(Intl の初期化)をやり直すため重い(1件あたり数十マイクロ秒)。行の多い画面で1件ごとに
 * 呼ぶと、Cloudflare Workers 無料プランの CPU 上限(10ms)を超えて Error 1102 になる
 * (2026-10-18: 操作ログの画面で 810ms)。書式はここで1回だけ作って使い回すこと。
 * 結果は同じオプションの toLocaleString と同じ文字列になる。
 */

const TZ = "Asia/Tokyo";

const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateWeekdayFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type DateInput = string | number | Date;

const toDate = (v: DateInput) => (v instanceof Date ? v : new Date(v));

/** "2026/07/15 09:05" */
export function formatJstDateTime(v: DateInput) {
  return dateTimeFmt.format(toDate(v));
}

/** "2026/07/15" */
export function formatJstDate(v: DateInput) {
  return dateFmt.format(toDate(v));
}

/** "2026/07/15(水)" */
export function formatJstDateWeekday(v: DateInput) {
  return dateWeekdayFmt.format(toDate(v));
}

/** "2026-07-15"(日本時間の暦日) */
export function jstYmd(v: DateInput) {
  return ymdFmt.format(toDate(v));
}
