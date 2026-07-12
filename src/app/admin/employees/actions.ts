"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { sendMail } from "@/lib/email";

const employeeSchema = z
  .object({
    role: z.enum(["admin", "employee"]),
    name: z.string().min(1, "氏名を入力してください"),
    email: z.email("メールアドレスの形式が正しくありません"),
    hourly_wage: z.coerce.number().int().optional(),
    tax_category: z.enum(["kou", "otsu"]).optional(),
    dependents: z.coerce.number().int().min(0).optional(),
    effective_from: z.string().optional(),
  })
  .refine(
    (d) =>
      d.role === "admin" ||
      (typeof d.hourly_wage === "number" &&
        d.hourly_wage > 0 &&
        d.tax_category !== undefined &&
        !!d.effective_from),
    { message: "従業員の場合は時給・税区分・適用開始日を入力してください" }
  );

export type ActionResult = { ok: boolean; message: string };

/** 役割に応じた従業員No(管理者=M001〜、従業員=E001〜)を自動採番する */
async function nextEmployeeNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  isAdmin: boolean
): Promise<string> {
  const prefix = isAdmin ? "M" : "E";
  const { data } = await supabase
    .from("employees")
    .select("employee_no")
    .ilike("employee_no", `${prefix}%`);
  let max = 0;
  for (const r of data ?? []) {
    const m = /^[ME](\d+)$/.exec(r.employee_no ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(3, "0");
}

export async function addEmployee(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = employeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const isAdmin = d.role === "admin";
  const supabase = await createClient();

  const employee_no = await nextEmployeeNo(supabase, isAdmin);

  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      employee_no,
      name: d.name,
      email: d.email.toLowerCase(),
      is_admin: isAdmin,
    })
    .select("id")
    .single();

  if (error) {
    const message = error.code === "23505"
      ? "メールアドレスがすでに登録されています"
      : "登録に失敗しました: " + error.message;
    return { ok: false, message };
  }

  if (!isAdmin) {
    const [wageResult, taxResult] = await Promise.all([
      supabase.from("wage_rates").insert({
        employee_id: employee.id,
        hourly_wage: d.hourly_wage,
        effective_from: d.effective_from,
      }),
      supabase.from("tax_settings").insert({
        employee_id: employee.id,
        tax_category: d.tax_category,
        dependents: d.dependents ?? 0,
        effective_from: d.effective_from,
      }),
    ]);

    if (wageResult.error || taxResult.error) {
      return {
        ok: false,
        message:
          "従業員は登録しましたが、時給/税区分の設定に失敗しました。編集画面から設定してください。",
      };
    }
  }

  revalidatePath("/admin/employees");
  return {
    ok: true,
    message: `${d.name} さんを ${employee_no}(${
      isAdmin ? "管理者" : "従業員"
    })として登録しました。本人に初回登録を案内してください。`,
  };
}

const profileSchema = z.object({
  employee_id: z.uuid(),
  name: z.string().min(1, "氏名を入力してください"),
  email: z.email("メールアドレスの形式が正しくありません"),
});

/** 氏名・メールアドレスを変更する。メール変更時は未登録に戻す(要・再招待) */
export async function updateEmployeeProfile(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("employees")
    .select("email")
    .eq("id", d.employee_id)
    .maybeSingle();
  if (!current) return { ok: false, message: "従業員が見つかりません" };

  const newEmail = d.email.toLowerCase();
  const emailChanged = newEmail !== current.email;

  const update: { name: string; email: string; auth_user_id?: null } = {
    name: d.name,
    email: newEmail,
  };
  if (emailChanged) update.auth_user_id = null;

  const { error } = await supabase
    .from("employees")
    .update(update)
    .eq("id", d.employee_id);

  if (error) {
    const message =
      error.code === "23505"
        ? "そのメールアドレスは他の従業員が使用しています"
        : "更新に失敗しました";
    return { ok: false, message };
  }

  revalidatePath("/admin/employees");
  return {
    ok: true,
    message: emailChanged
      ? "氏名・メールを更新しました。メール変更により未登録に戻したため、再度招待してください。"
      : "氏名を更新しました",
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

/** 未登録の従業員に初回登録を依頼するメールを送る */
export async function inviteEmployee(employeeId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name, email, auth_user_id, status")
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) return { ok: false, message: "従業員が見つかりません" };
  if (employee.auth_user_id) {
    return { ok: false, message: "すでに初回登録が完了しています" };
  }
  if (employee.status !== "active") {
    return { ok: false, message: "退職済みの従業員には送信できません" };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const registerUrl = `https://${host}/register`;

  const result = await sendMail({
    to: employee.email,
    subject: "【給与管理システム】初回登録のお願い",
    text: [
      `${employee.name} 様`,
      "",
      "勤務表の入力と給与明細の確認に使う「給与管理システム」の利用登録をお願いします。",
      "",
      "▼ 登録手順(スマホで1分で完了します)",
      `1. 次のリンクを開く: ${registerUrl}`,
      `2. このメールを受信したメールアドレス(${employee.email})を入力`,
      "3. お好きなパスワード(8文字以上)を設定して「登録する」",
      "4. 届いた確認メールのリンクをタップして完了",
      "",
      "登録後は同じページからログインして、勤務日・交通費をカレンダーで入力してください。",
    ].join("\n"),
  });

  if (!result.ok) return result;
  return { ok: true, message: `${employee.name} さんに招待メールを送信しました` };
}

/** 登録済み従業員にパスワード再設定メールを送る(本人が /set-password で再設定) */
export async function resetEmployeePassword(
  employeeId: string
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name, email, auth_user_id, status")
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) return { ok: false, message: "従業員が見つかりません" };
  if (!employee.auth_user_id) {
    return {
      ok: false,
      message: "まだ初回登録が完了していません。先に「招待」を送ってください。",
    };
  }
  if (employee.status !== "active") {
    return { ok: false, message: "退職済みの従業員には送信できません" };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  // 再設定リンクをクリック → /auth/callback で token_hash を検証してセッション確立
  // → /set-password へ。本人は別端末(スマホ等)でメールを開くため、PKCE では
  // code_verifier がその端末に無く verifyOtp が失敗する。送信は implicit フローの
  // クライアントで行い、端末非依存の token_hash を発行させる。
  const redirectTo = `https://${host}/auth/callback?setup=1`;

  const mailer = await createClient({ flowType: "implicit" });
  const { error } = await mailer.auth.resetPasswordForEmail(employee.email, {
    redirectTo,
  });

  if (error) {
    return {
      ok: false,
      message: "再設定メールの送信に失敗しました: " + error.message,
    };
  }

  return {
    ok: true,
    message: `${employee.name} さんにパスワード再設定メールを送信しました`,
  };
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
