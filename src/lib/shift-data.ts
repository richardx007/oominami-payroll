import type { createClient } from "@/lib/supabase/server";
import { shiftPeriodFor } from "@/lib/period";
import {
  defaultShiftMode,
  parseSlots,
  type ShiftMode,
  type ShiftStatus,
  type SlotKey,
} from "@/lib/shifts";
import type {
  Assignment,
  RosterMember,
  ShiftLock,
} from "@/app/admin/shifts/ShiftSchedule";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** app_settings 行から「シフト表を1日始まりにする」フラグを読む */
export function isShiftMonthStart(
  rows: { key: string; value: string }[] | null | undefined
): boolean {
  const v = (rows ?? []).find((r) => r.key === "shift_month_start")?.value;
  return v === "1" || v === "true";
}

/**
 * シフト予定表の描画に必要なデータをまとめて取得する(管理者・従業員で共用)。
 * 名簿・枠設定・予実状態は SECURITY DEFINER 関数経由で取得するため、
 * 従業員セッションでも全員ぶんを安全に読める(他人の勤務時刻は返らない)。
 * 期間は設定「シフト表を1日始まり」に応じて暦月/給与期間を切り替える(URLキー p から算出)。
 */
export async function loadShiftData(
  supabase: SupabaseServer,
  p: string | undefined
) {
  // 期間を決めるため、まず枠設定(1日始まりフラグを含む)を読む
  const { data: settingRows } = await supabase.rpc("get_shift_settings");
  const monthStart = isShiftMonthStart(
    settingRows as { key: string; value: string }[]
  );
  const period = shiftPeriodFor(p, monthStart);

  const [
    { data: rosterRows },
    { data: assignRows },
    { data: lockRows },
    { data: statusRows },
    { data: modeRow },
  ] = await Promise.all([
      supabase.rpc("get_shift_roster"),
      supabase
        .from("shift_assignments")
        .select("employee_id, work_date, slot, custom_start, custom_end")
        .gte("work_date", period.start)
        .lte("work_date", period.end),
      // 本人がかけた「変更不可」ロック(シフトの有無に関わらず存在しうる)
      supabase
        .from("shift_locks")
        .select("employee_id, work_date")
        .gte("work_date", period.start)
        .lte("work_date", period.end),
      supabase.rpc("get_shift_status", {
        p_start: period.start,
        p_end: period.end,
      }),
      // シフトのモード(確定/調整中)。行が無い月は既定(翌月度以降=調整中)を使う
      supabase
        .from("shift_modes")
        .select("status")
        .eq("period_key", period.key)
        .maybeSingle(),
    ]);

  // 既定モードの判定に使う「今の期間」のキー(1日始まり設定を反映)
  const currentKey = shiftPeriodFor(undefined, monthStart).key;
  const mode: ShiftMode =
    (modeRow?.status as ShiftMode | undefined) ??
    defaultShiftMode(period.key, currentKey);

  const slots = parseSlots(settingRows as { key: string; value: string }[]);
  const roster = (rosterRows ?? []) as RosterMember[];
  const assignments = (assignRows ?? []) as Assignment[];
  const locks = (lockRows ?? []) as ShiftLock[];

  const statusMap: Record<string, ShiftStatus> = {};
  for (const r of (statusRows ?? []) as {
    employee_id: string;
    work_date: string;
    status: ShiftStatus;
  }[]) {
    statusMap[`${r.employee_id}|${r.work_date}`] = r.status;
  }

  return {
    period,
    slots,
    roster,
    assignments,
    locks,
    statusMap,
    monthStart,
    mode,
  };
}

/** 従業員の指定枠の割当を SlotKey で引くマップを作る(勤務表の予定時刻デフォルト用) */
export function slotKeyForEmployee(
  assignments: Assignment[],
  employeeId: string
): Map<string, SlotKey> {
  const m = new Map<string, SlotKey>();
  for (const a of assignments) {
    if (a.employee_id === employeeId) m.set(a.work_date, a.slot);
  }
  return m;
}
