"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

const employeeSchema = z.object({
  employee_no: z.string().min(1, "雇用者Noを入力してください"),
  name: z.string().min(1, "氏名を入力してください"),
  email: z.email("メールアドレスの形式が正しくありません"),
  hourly_wage: z.coerce.number().int().positive("時給は正の整数で入力してください"),
  tax_category: z.enum(["kou", "otsu"]),
  dependents: z.coerce.number().int().min(0),
  effective_from: z.string().min(1, "適用開始日を入力してください"),
});

export type ActionResult = { ok: boolean; message: string };

export async function addEmployee(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = employeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      employee_no: d.employee_no,
      name: d.name,
      email: d.email.toLowerCase(),
      is_admin: false,
    })
    .select("id")
    .single();

  if (error) {
    const message = error.code === "23505"
      ? "雇用者Noまたはメールアドレスがすでに登録されています"
      : "登録に失敗しました: " + error.message;
    return { ok: false, message };
  }

  const [wageResult, taxResult] = await Promise.all([
    supabase.from("wage_rates").insert({
      employee_id: employee.id,
      hourly_wage: d.hourly_wage,
      effective_from: d.effective_from,
    }),
    supabase.from("tax_settings").insert({
      employee_id: employee.id,
      tax_category: d.tax_category,
      dependents: d.dependents,
      effective_from: d.effective_from,
    }),
  ]);

  if (wageResult.error || taxResult.error) {
    return {
      ok: false,
      message:
        "雇用者は登録しましたが、時給/税区分の設定に失敗しました。編集画面から設定してください。",
    };
  }

  revalidatePath("/admin/employees");
  return {
    ok: true,
    message: `${d.name} さんを登録しました。本人に初回登録(メールアドレス+パスワード設定)を案内してください。`,
  };
}

const wageSchema = z.object({
  employee_id: z.uuid(),
  hourly_wage: z.coerce.number().int().positive("時給は正の整数で入力してください"),
  effective_from: z.string().min(1, "適用開始日を入力してください"),
});

export async function updateWage(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = wageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("wage_rates").upsert(
    {
      employee_id: d.employee_id,
      hourly_wage: d.hourly_wage,
      effective_from: d.effective_from,
    },
    { onConflict: "employee_id,effective_from" }
  );

  if (error) return { ok: false, message: "時給の更新に失敗しました" };

  revalidatePath("/admin/employees");
  return { ok: true, message: "時給を更新しました" };
}

const taxSchema = z.object({
  employee_id: z.uuid(),
  tax_category: z.enum(["kou", "otsu"]),
  dependents: z.coerce.number().int().min(0),
  effective_from: z.string().min(1, "適用開始日を入力してください"),
});

export async function updateTaxSetting(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = taxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("tax_settings").upsert(
    {
      employee_id: d.employee_id,
      tax_category: d.tax_category,
      dependents: d.dependents,
      effective_from: d.effective_from,
    },
    { onConflict: "employee_id,effective_from" }
  );

  if (error) return { ok: false, message: "税区分の更新に失敗しました" };

  revalidatePath("/admin/employees");
  return { ok: true, message: "税区分を更新しました" };
}

export async function toggleEmployeeStatus(
  employeeId: string,
  newStatus: "active" | "retired"
): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ status: newStatus })
    .eq("id", employeeId);

  if (error) return { ok: false, message: "更新に失敗しました" };

  revalidatePath("/admin/employees");
  return {
    ok: true,
    message: newStatus === "retired" ? "退職処理しました" : "在籍に戻しました",
  };
}
