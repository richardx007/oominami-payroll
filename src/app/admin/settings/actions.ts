"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "../employees/actions";

const emailSettingsSchema = z.object({
  company_name: z.string().max(100),
  gmail_user: z.union([z.literal(""), z.email("送信元メールの形式が正しくありません")]),
  tax_accountant_email: z.union([
    z.literal(""),
    z.email("税理士メールの形式が正しくありません"),
  ]),
});

export async function updateEmailSettings(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = emailSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const rows = [
    { key: "company_name", value: d.company_name.trim() },
    { key: "gmail_user", value: d.gmail_user.trim() },
    { key: "tax_accountant_email", value: d.tax_accountant_email.trim() },
  ];
  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) return { ok: false, message: "更新に失敗しました" };

  revalidatePath("/admin/settings");
  return { ok: true, message: "メール設定を更新しました" };
}

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

const taxTableSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  csv: z.string().min(1, "データを貼り付けてください"),
});

/**
 * 源泉徴収税額表(月額表)のCSV取り込み。
 * 形式(1行1区分): 以上,未満,乙欄税額,甲欄扶養0,甲欄扶養1,甲欄扶養2,甲欄扶養3
 * 未満が空欄の行は上限なし。甲欄は省略可(乙欄のみ運用の場合)。
 */
export async function importTaxTable(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = taxTableSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const { year, csv } = parsed.data;

  const rows: {
    year: number;
    min_amount: number;
    max_amount: number | null;
    tax_otsu: number;
    tax_kou_0: number | null;
    tax_kou_1: number | null;
    tax_kou_2: number | null;
    tax_kou_3: number | null;
  }[] = [];

  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  for (const [i, line] of lines.entries()) {
    const cols = line.split(",").map((c) => c.trim().replaceAll("円", ""));
    const num = (s: string | undefined): number | null =>
      s === undefined || s === "" ? null : Number(s.replaceAll(",", ""));

    const min = num(cols[0]);
    const otsu = num(cols[2]);
    if (min === null || Number.isNaN(min) || otsu === null || Number.isNaN(otsu)) {
      return {
        ok: false,
        message: `${i + 1}行目の形式が不正です: 「以上,未満,乙欄税額,甲欄0,甲欄1,甲欄2,甲欄3」の形式で入力してください`,
      };
    }
    rows.push({
      year,
      min_amount: min,
      max_amount: num(cols[1]),
      tax_otsu: otsu,
      tax_kou_0: num(cols[3]),
      tax_kou_1: num(cols[4]),
      tax_kou_2: num(cols[5]),
      tax_kou_3: num(cols[6]),
    });
  }

  if (rows.length === 0) {
    return { ok: false, message: "有効なデータ行がありません" };
  }

  const supabase = await createClient();

  // 同一年度を入れ替え
  const { error: deleteError } = await supabase
    .from("withholding_tax_table")
    .delete()
    .eq("year", year);
  if (deleteError) return { ok: false, message: "既存データの削除に失敗しました" };

  const { error: insertError } = await supabase
    .from("withholding_tax_table")
    .insert(rows);
  if (insertError) {
    return { ok: false, message: "登録に失敗しました: " + insertError.message };
  }

  revalidatePath("/admin/settings");
  return { ok: true, message: `${year}年分の税額表を${rows.length}区分登録しました` };
}
