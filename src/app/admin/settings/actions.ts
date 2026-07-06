"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "../employees/actions";

const allowanceSchema = z.object({
  lunch_allowance_per_day: z.coerce.number().int().min(0, "0以上で入力してください"),
  effective_from: z.string().min(1, "適用開始日を入力してください"),
});

export async function updateLunchAllowance(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = allowanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("allowance_settings").upsert(
    {
      lunch_allowance_per_day: d.lunch_allowance_per_day,
      effective_from: d.effective_from,
    },
    { onConflict: "effective_from" }
  );

  if (error) return { ok: false, message: "更新に失敗しました" };

  revalidatePath("/admin/settings");
  return { ok: true, message: "昼食補助を更新しました" };
}
