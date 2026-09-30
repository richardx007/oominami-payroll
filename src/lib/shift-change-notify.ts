import type { PushMessage } from "./business-calendar-notify";

/** DB関数 collect_shift_change_notices() から届く通知1件(1人ぶん) */
export type ShiftChangeNotice = {
  /** 日ごとの変更(最初の変更前 → 最後の変更後。日付順) */
  changes: { date: string; before: string; after: string }[];
  /** 変更した人(リーダ・管理者)の表示名 */
  actors: string[];
};

/** 本文に並べる日数の上限(超えた分は「ほかN日」にまとめる。通知の本文は端末で切れるため) */
const MAX_LINES = 5;

/** 確定月のシフトが他人に変更されたときの通知の文面 */
export function buildShiftChangeMessage(n: ShiftChangeNotice): PushMessage {
  const lines = n.changes
    .slice(0, MAX_LINES)
    .map((c) => `${c.date} ${c.before} → ${c.after}`);
  const rest = n.changes.length - MAX_LINES;
  if (rest > 0) lines.push(`ほか${rest}日`);
  const by = n.actors.length > 0 ? `（変更: ${n.actors.join("・")}）` : "";
  return {
    title: "確定シフトが変更されました",
    body: `${lines.join("\n")}${by ? `\n${by}` : ""}`,
    tag: "shift-change",
    url: "/shifts",
  };
}
