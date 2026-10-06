import type { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/log";

/**
 * 勤務表での手動変更を操作ログ(カテゴリ「勤務修正」)に残す(従業員・管理者で共用)。
 * 記録する項目は出勤時刻・退勤時刻・交通費・昼食費(管理者のみ)。メモだけの変更は記録しない。
 * サーバーアクション("use server")からは関数しか export できないため、通常モジュールに分けている。
 */

export const WORK_ENTRY_LOG_COLUMNS =
  "start_time, end_time, break_minutes, transport_cost, transport_mode, station_from, station_to, round_trip, " +
  "lunch_change_amount, lunch_change_reason_type, lunch_change_reason_note";

export type WorkEntrySnapshot = {
  start_time: string | null;
  end_time: string | null;
  transport_cost: number | null;
  transport_mode: string | null;
  station_from: string | null;
  station_to: string | null;
  round_trip: boolean | null;
  lunch_change_amount?: number | null;
  lunch_change_reason_type?: string | null;
  lunch_change_reason_note?: string | null;
};

const LUNCH_REASON_LABELS: Record<string, string> = { in_kind: "現物支給", other: "その他" };

const timeText = (t: string | null) => (t ? t.slice(0, 5) : "なし");

function transportText(e: WorkEntrySnapshot) {
  const cost = e.transport_cost ?? 0;
  const route = [e.transport_mode, e.station_from && e.station_to ? `${e.station_from}→${e.station_to}` : null]
    .filter(Boolean)
    .join(" ");
  if (cost === 0 && !route) return "なし";
  return `${cost}円${route ? `(${route} ${e.round_trip ? "往復" : "片道"})` : ""}`;
}

function lunchText(e: WorkEntrySnapshot) {
  if (e.lunch_change_amount == null) return "変更なし";
  const type = e.lunch_change_reason_type ?? "";
  const reason = type === "other" && e.lunch_change_reason_note ? `その他: ${e.lunch_change_reason_note}` : LUNCH_REASON_LABELS[type];
  return `${e.lunch_change_amount}円${reason ? `(${reason})` : ""}`;
}

/** 項目名と表示文字列。昼食費は管理者が入力したときだけ比べる */
function items(e: WorkEntrySnapshot, withLunch: boolean): [string, string][] {
  const list: [string, string][] = [
    ["出勤", timeText(e.start_time)],
    ["退勤", timeText(e.end_time)],
    ["交通費", transportText(e)],
  ];
  if (withLunch) list.push(["昼食費", lunchText(e)]);
  return list;
}

/**
 * 変更前後を比べて操作ログに記録する。before=null は新規、after=null は削除。
 * 記録対象の項目に変化が無ければ何もしない。
 */
export async function logWorkEntryChange(
  targetName: string,
  workDate: string,
  before: WorkEntrySnapshot | null,
  after: WorkEntrySnapshot | null,
  withLunch: boolean
): Promise<void> {
  let body: string;
  if (!before && after) {
    body = "新規: " + items(after, withLunch)
      .filter(([, v]) => v !== "なし" && v !== "変更なし")
      .map(([k, v]) => `${k} ${v}`)
      .join(" / ");
  } else if (before && !after) {
    body = "削除: " + items(before, withLunch).map(([k, v]) => `${k} ${v}`).join(" / ");
  } else if (before && after) {
    const a = items(after, withLunch);
    const changes = items(before, withLunch)
      .map(([k, v], i) => (v === a[i][1] ? null : `${k} ${v}→${a[i][1]}`))
      .filter(Boolean);
    if (changes.length === 0) return;
    body = changes.join(" / ");
  } else {
    return;
  }
  await logActivity("勤務修正", `${targetName} ${workDate} ${body}`);
}

/** 変更前の勤務記録(無ければ null) */
export async function fetchWorkEntrySnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  workDate: string
): Promise<(WorkEntrySnapshot & { start_time: string; break_minutes: number }) | null> {
  const { data } = await supabase
    .from("work_entries")
    .select(WORK_ENTRY_LOG_COLUMNS)
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle();
  return (data as unknown as (WorkEntrySnapshot & { start_time: string; break_minutes: number }) | null) ?? null;
}
