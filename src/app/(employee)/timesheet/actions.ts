"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";

export type ActionResult = { ok: boolean; message: string };

const entrySchema = z
  .object({
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    break_minutes: z.coerce.number().int().min(0).max(600),
    transport_cost: z.coerce.number().int().min(0).max(100000),
    transport_mode: z.string().max(20).optional(),
    station_from: z.string().max(50).optional(),
    station_to: z.string().max(50).optional(),
    round_trip: z.string().optional(), // "on" or undefined(checkbox)
    note: z.string().max(200).optional(),
  })
  .refine((d) => d.end_time > d.start_time, {
    message: "退勤時刻は出勤時刻より後にしてください",
  });

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

  const { error } = await supabase.from("work_entries").upsert(
    {
      employee_id: employee.id,
      work_date: d.work_date,
      start_time: d.start_time,
      end_time: d.end_time,
      break_minutes: d.break_minutes,
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

  const { error } = await supabase
    .from("work_entries")
    .delete()
    .eq("employee_id", employee.id)
    .eq("work_date", workDate);

  if (error) return { ok: false, message: "削除に失敗しました" };

  revalidatePath("/timesheet");
  return { ok: true, message: "削除しました" };
}
