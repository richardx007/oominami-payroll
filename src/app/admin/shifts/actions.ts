"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeSlotTime } from "@/lib/shifts";

export type ActionResult = { ok: boolean; message: string };

const assignSchema = z.object({
  employee_id: z.uuid(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["A", "B", "C"]),
  // 変則出勤/退勤予定(任意)。"8:00"/"24:00" 等を許容し、保存時に深夜0時=0:00へ正規化する。
  custom_start: z.string().max(5).optional(),
  custom_end: z.string().max(5).optional(),
});

/** 従業員のその日のシフト枠(＋任意の変則出勤/退勤予定)を設定(1従業員1日1枠。再設定で上書き)。 */
export async function assignShift(input: {
  employee_id: string;
  work_date: string;
  slot: string;
  custom_start?: string;
  custom_end?: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("shift_assignments").upsert(
    {
      employee_id: d.employee_id,
      work_date: d.work_date,
      slot: d.slot,
      custom_start: d.custom_start?.trim() ? normalizeSlotTime(d.custom_start) : null,
      custom_end: d.custom_end?.trim() ? normalizeSlotTime(d.custom_end) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,work_date" }
  );

  if (error) return { ok: false, message: "シフトの保存に失敗しました" };

  revalidatePath("/admin");
  return { ok: true, message: "保存しました" };
}

/** 従業員のその日のシフトを解除する。 */
export async function clearShift(
  employeeId: string,
  workDate: string
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("employee_id", employeeId)
    .eq("work_date", workDate);

  if (error) return { ok: false, message: "解除に失敗しました" };

  revalidatePath("/admin");
  return { ok: true, message: "解除しました" };
}
