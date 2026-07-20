"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { entrySchema } from "./schema";

export type ActionResult = { ok: boolean; message: string };

export async function upsertWorkEntry(
  formData: FormData
): Promise<ActionResult> {
  const employee = await requireEmployee();

  const parsed = entrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { data: locked } = await supabase.rpc("get_timesheet_lock");

  let start_time = d.start_time;
  let end_time = d.end_time || null;
  let break_minutes = d.break_minutes;

  if (locked) {
    // ロック中は出勤/退勤時刻・休憩時間をクライアントの入力値で信用せず、
    // 既存レコードの値に固定する(交通費・メモのみ更新可)。既存レコードが無い日は
    // 時刻を確定できないため新規作成を拒否する(QR打刻の利用を案内)。
    const { data: existing } = await supabase
      .from("work_entries")
      .select("start_time, end_time, break_minutes")
      .eq("employee_id", employee.id)
      .eq("work_date", d.work_date)
      .maybeSingle();

    if (!existing) {
      return {
        ok: false,
        message:
          "出退勤時刻・休憩時間の編集は管理者によりロックされています。QR打刻をご利用いただくか、管理者にご連絡ください。",
      };
    }
    start_time = existing.start_time.slice(0, 5);
    end_time = existing.end_time ? existing.end_time.slice(0, 5) : null;
    break_minutes = existing.break_minutes;
  }

  const { error } = await supabase.from("work_entries").upsert(
    {
      employee_id: employee.id,
      work_date: d.work_date,
      start_time,
      end_time,
      break_minutes,
      transport_cost: d.transport_cost,
      transport_mode: d.transport_mode?.trim() || null,
      station_from: d.station_from?.trim() || null,
      station_to: d.station_to?.trim() || null,
      round_trip: d.round_trip === "on",
      note: d.note || null,
    },
    { onConflict: "employee_id,work_date" }
  );

  if (error) {
    const message =
      error.code === "42501" || error.message.includes("policy")
        ? "この期間は締め済みのため入力できません"
        : "保存に失敗しました";
    return { ok: false, message };
  }

  revalidatePath("/timesheet");
  return { ok: true, message: "保存しました" };
}

export async function deleteWorkEntry(workDate: string): Promise<ActionResult> {
  const employee = await requireEmployee();
  const supabase = await createClient();

  const { data: locked } = await supabase.rpc("get_timesheet_lock");
  if (locked) {
    return {
      ok: false,
      message:
        "出退勤時刻・休憩時間の編集は管理者によりロックされています。削除は管理者にご連絡ください。",
    };
  }

  const { error } = await supabase
    .from("work_entries")
    .delete()
    .eq("employee_id", employee.id)
    .eq("work_date", workDate);

  if (error) return { ok: false, message: "削除に失敗しました" };

  revalidatePath("/timesheet");
  return { ok: true, message: "削除しました" };
}
