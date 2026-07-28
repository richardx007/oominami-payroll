"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireEmployee } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import { normalizeSlotTime, type ShiftMode } from "@/lib/shifts";

export type ActionResult = { ok: boolean; message: string };

const assignSchema = z.object({
  employee_id: z.uuid(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["A", "B", "C"]),
  // 変則出勤/退勤予定(任意)。"8:00"/"24:00" 等を許容し、保存時に深夜0時=0:00へ正規化する。
  custom_start: z.string().max(5).optional(),
  custom_end: z.string().max(5).optional(),
});

/**
 * 操作してよいかを判定する。管理者は常に可。従業員は「調整中」の月の自分の行だけ操作できる
 * (最終的な担保は RLS。ここは画面に分かりやすい理由を返すためのチェック)。
 */
async function canEditShift(
  employeeId: string,
  workDate: string
): Promise<ActionResult> {
  const me = await requireEmployee();
  if (me.is_admin) return { ok: true, message: "" };

  if (employeeId !== me.id) {
    return { ok: false, message: "他の人のシフトは変更できません" };
  }
  const supabase = await createClient();
  const { data: draft } = await supabase.rpc("is_shift_draft", { d: workDate });
  if (!draft) {
    return {
      ok: false,
      message: "この月のシフトは確定済みです。変更は管理者にご連絡ください。",
    };
  }
  return { ok: true, message: "" };
}

/** 従業員のその日のシフト枠(＋任意の変則出勤/退勤予定)を設定(1従業員1日1枠。再設定で上書き)。 */
export async function assignShift(input: {
  employee_id: string;
  work_date: string;
  slot: string;
  custom_start?: string;
  custom_end?: string;
}): Promise<ActionResult> {
  const allowed = await canEditShift(input.employee_id, input.work_date);
  if (!allowed.ok) return allowed;
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
  revalidatePath("/shifts");
  return { ok: true, message: "保存しました" };
}

/** 従業員のその日のシフトを解除する。 */
export async function clearShift(
  employeeId: string,
  workDate: string
): Promise<ActionResult> {
  const allowed = await canEditShift(employeeId, workDate);
  if (!allowed.ok) return allowed;
  const supabase = await createClient();

  const { error } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("employee_id", employeeId)
    .eq("work_date", workDate);

  if (error) return { ok: false, message: "解除に失敗しました" };

  revalidatePath("/admin");
  revalidatePath("/shifts");
  return { ok: true, message: "解除しました" };
}

/**
 * シフトのモード(確定/調整中)を月ごとに切り替える。管理者のみ。
 * 調整中にすると従業員が自分の希望を入力できるようになり、確定にすると
 * 従業員は変更できなくなる(かわりに全員が全員のシフトを閲覧できる)。
 */
export async function setShiftMode(
  periodKey: string,
  status: ShiftMode
): Promise<ActionResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    return { ok: false, message: "期間の指定が不正です" };
  }
  if (status !== "draft" && status !== "confirmed") {
    return { ok: false, message: "モードの指定が不正です" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_modes")
    .upsert(
      { period_key: periodKey, status, updated_at: new Date().toISOString() },
      { onConflict: "period_key" }
    );
  if (error) return { ok: false, message: "切り替えに失敗しました" };

  await logActivity(
    "シフト",
    `${periodKey} のシフトを${status === "draft" ? "調整中" : "確定"}にしました`
  );
  revalidatePath("/admin");
  revalidatePath("/shifts");
  return {
    ok: true,
    message:
      status === "draft"
        ? "調整中にしました(従業員が希望を入力できます)"
        : "確定にしました(従業員は変更できません)",
  };
}
