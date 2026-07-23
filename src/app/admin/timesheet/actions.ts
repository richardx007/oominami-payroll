"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { standardBreakMinutes } from "@/lib/period";
import { entrySchema } from "@/app/(employee)/timesheet/schema";
import type { ActionResult } from "@/app/(employee)/timesheet/actions";

/**
 * 管理者が任意の従業員の勤務記録を登録・更新する。
 * employee_id を明示する以外はロジックは従業員用と同一(スキーマを共用)。
 * RLS は管理者に全件書き込みを許可しているため期間ロックの影響を受けない。
 */
export async function adminUpsertWorkEntry(
  employeeId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = entrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("work_entries").upsert(
    {
      employee_id: employeeId,
      work_date: d.work_date,
      start_time: d.start_time,
      end_time: d.end_time || null,
      // 休憩は標準休憩ルールから自動計算(退勤未入力なら0)
      break_minutes: d.end_time
        ? standardBreakMinutes(d.start_time, d.end_time)
        : 0,
      transport_cost: d.transport_cost,
      transport_mode: d.transport_mode?.trim() || null,
      station_from: d.station_from?.trim() || null,
      station_to: d.station_to?.trim() || null,
      round_trip: d.round_trip === "on",
      note: d.note || null,
    },
    { onConflict: "employee_id,work_date" }
  );

  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/timesheet");
  return { ok: true, message: "保存しました" };
}

export async function adminDeleteWorkEntry(
  employeeId: string,
  workDate: string
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("work_entries")
    .delete()
    .eq("employee_id", employeeId)
    .eq("work_date", workDate);

  if (error) return { ok: false, message: "削除に失敗しました" };

  revalidatePath("/admin/timesheet");
  return { ok: true, message: "削除しました" };
}
