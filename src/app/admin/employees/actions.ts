"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { logActivity } from "@/lib/log";
import { getSiteUrl } from "@/lib/site-url";

const employeeSchema = z
  .object({
    role: z.enum(["admin", "employee"]),
    name: z.string().min(1, "氏名を入力してください"),
    furigana: z.string().max(50).optional(),
    nickname: z.string().max(50).optional(),
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
        d.hourly_wage >= 0 &&
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
      furigana: d.furigana?.trim() || null,
      nickname: d.nickname?.trim() || null,
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
  furigana: z.string().max(50).optional(),
  nickname: z.string().max(50).optional(),
  email: z.email("メールアドレスの形式が正しくありません"),
  // シフト表のニックネーム背景色(パレット10色のいずれか。空=未設定)
  color: z.string().max(9).optional(),
});

/** 氏名・ふりがな・ニックネーム・メールアドレスを変更する。メール変更時は未登録に戻す(要・再招待) */
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

  const update: {
    name: string;
    furigana: string | null;
    nickname: string | null;
    email: string;
    color: string | null;
    auth_user_id?: null;
  } = {
    name: d.name,
    furigana: d.furigana?.trim() || null,
    nickname: d.nickname?.trim() || null,
    email: newEmail,
    color: d.color?.trim() || null,
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
  // 0円を許容(経営者が現場ヘルプで入る場合など無給勤務の記録用途)
  hourly_wage: z.coerce.number().int().min(0, "時給は0以上の整数で入力してください"),
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

  await logActivity(
    "時給変更",
    `時給を設定: employee=${d.employee_id} ${d.effective_from}〜 ¥${d.hourly_wage}`
  );
  revalidatePath("/admin/employees");
  return { ok: true, message: "時給を更新しました" };
}

const editWageSchema = z.object({
  employee_id: z.uuid(),
  // 編集対象の履歴行を特定するための元の適用開始日
  original_effective_from: z.string().min(1),
  hourly_wage: z.coerce.number().int().min(0, "時給は0以上の整数で入力してください"),
  effective_from: z.string().min(1, "適用開始日を入力してください"),
});

/** 時給履歴の1行を訂正する(金額・適用開始日の変更に対応)。
 *  適用開始日を変える場合は (employee_id, effective_from) の一意制約に
 *  他の行が衝突しないか確認してから、旧行を消して入れ直す。 */
export async function editWageRate(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = editWageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const dateChanged = d.effective_from !== d.original_effective_from;

  if (dateChanged) {
    // 変更後の適用開始日に既存の別レートがあると上書きしてしまうため事前に確認
    const { data: clash } = await supabase
      .from("wage_rates")
      .select("effective_from")
      .eq("employee_id", d.employee_id)
      .eq("effective_from", d.effective_from)
      .maybeSingle();
    if (clash) {
      return {
        ok: false,
        message: `${d.effective_from} には既に別の時給が登録されています。先にそちらを整理してください。`,
      };
    }
    const { error: delError } = await supabase
      .from("wage_rates")
      .delete()
      .eq("employee_id", d.employee_id)
      .eq("effective_from", d.original_effective_from);
    if (delError) {
      return { ok: false, message: "時給の訂正に失敗しました" };
    }
  }

  const { error } = await supabase.from("wage_rates").upsert(
    {
      employee_id: d.employee_id,
      hourly_wage: d.hourly_wage,
      effective_from: d.effective_from,
    },
    { onConflict: "employee_id,effective_from" }
  );

  if (error) return { ok: false, message: "時給の訂正に失敗しました" };

  await logActivity(
    "時給変更",
    dateChanged
      ? `時給履歴を訂正: employee=${d.employee_id} ${d.original_effective_from}〜 → ${d.effective_from}〜 ¥${d.hourly_wage}`
      : `時給履歴を訂正: employee=${d.employee_id} ${d.effective_from}〜 ¥${d.hourly_wage}`
  );
  revalidatePath("/admin/employees");
  return { ok: true, message: "時給履歴を訂正しました" };
}

const deleteWageSchema = z.object({
  employee_id: z.uuid(),
  effective_from: z.string().min(1),
});

/** 時給履歴の1行を削除する(誤って追加したレートの取り消し用) */
export async function deleteWageRate(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = deleteWageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("wage_rates")
    .delete()
    .eq("employee_id", d.employee_id)
    .eq("effective_from", d.effective_from);

  if (error) return { ok: false, message: "時給履歴の削除に失敗しました" };

  await logActivity(
    "時給変更",
    `時給履歴を削除: employee=${d.employee_id} ${d.effective_from}〜`
  );
  revalidatePath("/admin/employees");
  return { ok: true, message: "時給履歴を削除しました" };
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

  const registerUrl = `${getSiteUrl()}/register`;

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
      "3. お好きなパスワード(8文字以上・英字と数字を両方含める)を設定して「登録する」",
      "4. 届いた確認メールのリンクをタップして完了",
      "",
      "登録後は同じページからログインして、勤務日・交通費をカレンダーで入力してください。",
    ].join("\n"),
  });

  if (!result.ok) return result;

  // 招待日を記録(再招待で更新)。メール送信成功後に更新する。
  await supabase
    .from("employees")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", employeeId);

  revalidatePath("/admin/employees");
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

  // 再設定リンクをクリック → /auth/callback で token_hash を検証してセッション確立
  // → /set-password へ。本人は別端末(スマホ等)でメールを開くため、PKCE では
  // code_verifier がその端末に無く verifyOtp が失敗する。送信は implicit フローの
  // クライアントで行い、端末非依存の token_hash を発行させる。
  const redirectTo = `${getSiteUrl()}/auth/callback?setup=1`;

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

  await logActivity(
    "メール送信",
    `パスワード再設定メール(管理者発行): ${employee.name} (${employee.email})`
  );
  return {
    ok: true,
    message: `${employee.name} さんにパスワード再設定メールを送信しました`,
  };
}

/** 従業員の勤務実績(work_entries)の件数を返す。削除前の警告表示に使う。 */
export async function countEmployeeWorkEntries(
  employeeId: string
): Promise<number> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.rpc("count_employee_work_entries", {
    p_employee_id: employeeId,
  });
  return typeof data === "number" ? data : 0;
}

/**
 * 従業員を完全削除する(元に戻せない)。勤務実績・給与明細・時給/税区分は
 * DB の FK CASCADE で、連絡(notifications)は delete_employee 関数内で削除される。
 */
export async function deleteEmployee(
  employeeId: string
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  // ログ用に削除前の氏名・メールを控えておく
  const { data: target } = await supabase
    .from("employees")
    .select("employee_no, name, email")
    .eq("id", employeeId)
    .maybeSingle();

  const { error } = await supabase.rpc("delete_employee", {
    p_employee_id: employeeId,
  });

  if (error) {
    await logActivity(
      "エラー",
      `従業員削除に失敗: ${target?.name ?? employeeId} / ${error.message}`
    );
    return { ok: false, message: "削除に失敗しました: " + error.message };
  }

  await logActivity(
    "削除",
    `従業員を削除: ${target?.employee_no ?? ""} ${target?.name ?? ""} (${target?.email ?? employeeId})`
  );
  revalidatePath("/admin/employees");
  return { ok: true, message: "従業員と関連データを削除しました" };
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
