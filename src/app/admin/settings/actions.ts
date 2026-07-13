"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "../employees/actions";

const emailSettingsSchema = z.object({
  company_name: z.string().max(100),
  gmail_user: z.union([z.literal(""), z.email("送信元メールの形式が正しくありません")]),
  tax_accountant_name: z.string().max(100),
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
    { key: "tax_accountant_name", value: d.tax_accountant_name.trim() },
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

type TaxTableInsertRow = {
  year: number;
  min_amount: number;
  max_amount: number | null;
  tax_otsu: number;
  tax_kou_0: number | null;
  tax_kou_1: number | null;
  tax_kou_2: number | null;
  tax_kou_3: number | null;
  tax_kou_4: number | null;
  tax_kou_5: number | null;
  tax_kou_6: number | null;
  tax_kou_7: number | null;
};

/**
 * 源泉徴収税額表(月額表)のCSV取り込み。
 * 国税庁の公開様式に合わせ、甲欄(扶養0〜7人)・乙欄をそのまま保持する。
 * 形式(1行1区分): 以上,未満,甲0,甲1,甲2,甲3,甲4,甲5,甲6,甲7,乙
 *   - 甲欄の途中列は空欄可。乙欄(最終列)は必須。
 *   - 未満が空欄の行は上限なし(最終行)。
 * 後方互換: 3列「以上,未満,乙」の乙欄のみ運用も受け付ける。
 */
export async function importTaxTable(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = taxTableSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const { year, csv: rawCsv } = parsed.data;

  // Excel の月額表からコピペするとタブ区切りになり、かつ数値内に3桁区切りの
  // カンマが入る。タブを含む場合はまずカンマ(桁区切り)を全除去してから
  // タブをカンマに置換し、通常のCSVとして処理する。
  const csv = rawCsv.includes("\t")
    ? rawCsv.replace(/,/g, "").replace(/\t/g, ",")
    : rawCsv;

  const rows: TaxTableInsertRow[] = [];

  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const num = (s: string | undefined): number | null =>
    s === undefined || s === "" ? null : Number(s.replaceAll(",", ""));

  for (const [i, line] of lines.entries()) {
    const cols = line.split(",").map((c) => c.trim().replaceAll("円", ""));
    const bad = (msg: string): ActionResult => ({
      ok: false,
      message: `${i + 1}行目の形式が不正です: ${msg}`,
    });

    const min = num(cols[0]);
    if (min === null || Number.isNaN(min)) {
      return bad("「以上」の金額を数値で入力してください");
    }

    // 乙欄のみの3列運用(以上,未満,乙)にも対応する
    const otsuOnly = cols.length <= 3;
    const otsu = num(otsuOnly ? cols[2] : cols[10]);
    if (otsu === null || Number.isNaN(otsu)) {
      return bad(
        otsuOnly
          ? "3列運用では「以上,未満,乙欄税額」で入力してください"
          : "最終列の乙欄税額を数値で入力してください(以上,未満,甲0〜甲7,乙)"
      );
    }

    rows.push({
      year,
      min_amount: min,
      max_amount: num(cols[1]),
      tax_otsu: otsu,
      tax_kou_0: otsuOnly ? null : num(cols[2]),
      tax_kou_1: otsuOnly ? null : num(cols[3]),
      tax_kou_2: otsuOnly ? null : num(cols[4]),
      tax_kou_3: otsuOnly ? null : num(cols[5]),
      tax_kou_4: otsuOnly ? null : num(cols[6]),
      tax_kou_5: otsuOnly ? null : num(cols[7]),
      tax_kou_6: otsuOnly ? null : num(cols[8]),
      tax_kou_7: otsuOnly ? null : num(cols[9]),
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
