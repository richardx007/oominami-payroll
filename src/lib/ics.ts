/**
 * シフトのカレンダー購読フィード(ICS / RFC 5545)を組み立てる。
 * 入力は DB 関数 calendar_feed() の返り値。ルートは src/app/api/ics/[file]/route.ts。
 *
 * - 時刻は UTC("...Z")で出力する(VTIMEZONE を持たずに済み、どのカレンダーアプリでも解釈が一致する)。
 * - 深夜番の日跨ぎ(0〜5時始まりは翌日)は scheduleWindow() に任せる。
 * - 「調整中」の月の予定は件名を「仮:早番」とし、STATUS:TENTATIVE にする。
 * - URL を知る人は誰でも見られるため、氏名などの個人情報は入れない。
 */

import { buildShiftMap, parseSlots, scheduleWindow, type SlotKey } from "./shifts";
import { slotsResolver, type WorkTimeSettingRow } from "./work-time";

export type CalendarFeedData = {
  employee_id: string;
  company_name: string | null;
  /** 旧形式(app_settings の現在値)。slot_versions が無い古い DB 関数の返り値用 */
  slots: { key: string; value: string }[];
  /** 適用開始日ごとの枠の定義 */
  slot_versions?: WorkTimeSettingRow[];
  shifts: {
    work_date: string;
    slot: SlotKey;
    custom_start: string | null;
    custom_end: string | null;
    draft: boolean;
  }[];
};

/** Date → "YYYYMMDDTHHMMSSZ" */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** TEXT 値のエスケープ(RFC 5545 3.3.11) */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * 1行75オクテット以内に折り返す(RFC 5545 3.1)。日本語はUTF-8で3バイトになるため
 * 文字数ではなくバイト数で数え、マルチバイト文字の途中では切らない。
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    // 2行目以降は先頭に空白1バイトが付くため上限を1減らす
    const limit = parts.length === 0 ? 75 : 74;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildShiftIcs(data: CalendarFeedData, now: Date = new Date()): string {
  // 枠の定義は適用開始日ごと(slot_versions)。旧形式(slots)しか無ければそれを使う
  const slots = data.slot_versions
    ? slotsResolver(data.slot_versions)
    : parseSlots(data.slots);
  const calName = `${data.company_name?.trim() || ""} シフト`.trim();
  const dtstamp = utcStamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//oominami-payroll//shift feed//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    // 再取得間隔の希望(従うかはクライアント次第。Googleカレンダーは無視して数時間〜1日おき)
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const s of data.shifts) {
    const info = buildShiftMap([s], slots)[s.work_date];
    if (!info) continue;
    const { startAt, endAt } = scheduleWindow(s.work_date, info.start, info.end);
    const summary = s.draft ? `仮:${info.label}` : info.label;
    const desc = s.draft
      ? `${info.start}〜${info.end}\n調整中の希望です（まだ確定していません）`
      : `${info.start}〜${info.end}`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:shift-${s.work_date}-${data.employee_id}@oominami-payroll`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${utcStamp(startAt)}`,
      `DTEND:${utcStamp(endAt)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(desc)}`,
      `STATUS:${s.draft ? "TENTATIVE" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
