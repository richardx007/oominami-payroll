import type { PushMessage } from "./business-calendar-notify";

/** DB関数 collect_shift_reminders() から届く通知1件 */
export type ShiftReminder = {
  /** start = シフト開始前 / end = シフト終了の前後 */
  kind: "start" | "end";
  /** 基準にした開始/終了時刻 "HH:MI" */
  time: string;
  /** 基準日 "M/D" */
  date: string;
  /** 基準時刻までの残り分数(終了後はマイナス) */
  minutes_left: number;
};

/** シフト開始前・終了前後の通知の文面 */
export function buildShiftReminderMessage(r: ShiftReminder): PushMessage {
  const n = r.minutes_left;
  if (r.kind === "start") {
    return {
      title: `シフト開始の${n}分前です`,
      body: `${r.date} ${r.time} からシフトです。`,
      tag: "shift-reminder-start",
      url: "/shifts",
    };
  }
  return {
    title:
      n > 0
        ? `シフト終了の${n}分前です`
        : n === 0
          ? "シフト終了の時刻です"
          : `シフト終了から${-n}分過ぎました`,
    body: `${r.date} ${r.time} 終了のシフトです。退勤の打刻をお忘れなく。`,
    tag: "shift-reminder-end",
    url: "/shifts",
  };
}
