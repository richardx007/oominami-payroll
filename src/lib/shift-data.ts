import type { createClient } from "@/lib/supabase/server";
import type { Period } from "@/lib/period";
import { parseSlots, type ShiftStatus, type SlotKey } from "@/lib/shifts";
import type {
  Assignment,
  RosterMember,
} from "@/app/admin/shifts/ShiftSchedule";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * シフト予定表の描画に必要なデータをまとめて取得する(管理者・従業員で共用)。
 * 名簿・枠設定・予実状態は SECURITY DEFINER 関数経由で取得するため、
 * 従業員セッションでも全員ぶんを安全に読める(他人の勤務時刻は返らない)。
 */
export async function loadShiftData(supabase: SupabaseServer, period: Period) {
  const [
    { data: rosterRows },
    { data: settingRows },
    { data: assignRows },
    { data: statusRows },
  ] = await Promise.all([
    supabase.rpc("get_shift_roster"),
    supabase.rpc("get_shift_settings"),
    supabase
      .from("shift_assignments")
      .select("employee_id, work_date, slot, note")
      .gte("work_date", period.start)
      .lte("work_date", period.end),
    supabase.rpc("get_shift_status", {
      p_start: period.start,
      p_end: period.end,
    }),
  ]);

  const slots = parseSlots(settingRows as { key: string; value: string }[]);
  const roster = (rosterRows ?? []) as RosterMember[];
  const assignments = (assignRows ?? []) as Assignment[];

  const statusMap: Record<string, ShiftStatus> = {};
  for (const r of (statusRows ?? []) as {
    employee_id: string;
    work_date: string;
    status: ShiftStatus;
  }[]) {
    statusMap[`${r.employee_id}|${r.work_date}`] = r.status;
  }

  return { slots, roster, assignments, statusMap };
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
