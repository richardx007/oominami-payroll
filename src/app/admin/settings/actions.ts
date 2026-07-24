"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import { normalizeSlotTime } from "@/lib/shifts";
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

const clockSchema = z.object({
  clock_base_lat: z.string(),
  clock_base_lng: z.string(),
  clock_radius_m: z.coerce.number().int().min(0),
  clock_out_of_range: z.enum(["reject", "warn"]),
  clock_round_min: z.coerce.number().int().min(0).max(60),
});

/** QR打刻の位置ポリシー(基準座標・半径・圏外時の扱い)を保存する */
export async function updateClockSettings(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = clockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "入力内容を確認してください" };
  }
  const d = parsed.data;
  const lat = parseFloat(d.clock_base_lat);
  const lng = parseFloat(d.clock_base_lng);
  if (
    d.clock_base_lat !== "" &&
    (!Number.isFinite(lat) || !Number.isFinite(lng))
  ) {
    return { ok: false, message: "基準位置を地図で指定してください" };
  }

  const supabase = await createClient();
  const rows = [
    { key: "clock_base_lat", value: d.clock_base_lat.trim() },
    { key: "clock_base_lng", value: d.clock_base_lng.trim() },
    { key: "clock_radius_m", value: String(d.clock_radius_m) },
    { key: "clock_out_of_range", value: d.clock_out_of_range },
    { key: "clock_round_min", value: String(d.clock_round_min) },
  ];
  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/settings");
  return { ok: true, message: "QR打刻の位置設定を保存しました" };
}

const slotFieldSchema = z.object({
  a_label: z.string().max(10),
  a_start: z.string().max(5),
  a_end: z.string().max(5),
  b_label: z.string().max(10),
  b_start: z.string().max(5),
  b_end: z.string().max(5),
  c_label: z.string().max(10),
  c_start: z.string().max(5),
  c_end: z.string().max(5),
  // 「1日始まり」チェックボックス。チェック時のみ "on" が送られる(未チェックは欠落)。
  month_start: z.string().optional(),
});

/** シフト枠(A/B/C)のラベル・時刻を保存する。時刻は深夜0時=0:00に正規化して保持する。 */
export async function updateShiftSlots(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = slotFieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "入力内容を確認してください" };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const rows = [
    { key: "shift_slot_a_label", value: d.a_label.trim() || "A" },
    { key: "shift_slot_a_start", value: normalizeSlotTime(d.a_start) },
    { key: "shift_slot_a_end", value: normalizeSlotTime(d.a_end) },
    { key: "shift_slot_b_label", value: d.b_label.trim() || "B" },
    { key: "shift_slot_b_start", value: normalizeSlotTime(d.b_start) },
    { key: "shift_slot_b_end", value: normalizeSlotTime(d.b_end) },
    { key: "shift_slot_c_label", value: d.c_label.trim() || "C" },
    { key: "shift_slot_c_start", value: normalizeSlotTime(d.c_start) },
    { key: "shift_slot_c_end", value: normalizeSlotTime(d.c_end) },
    { key: "shift_month_start", value: d.month_start ? "1" : "0" },
  ];
  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/shifts");
  return { ok: true, message: "シフト枠を保存しました" };
}

const breakWindowFieldSchema = z
  .object({
    break_1_start: z.string().regex(/^\d{1,2}:\d{2}$/),
    break_1_end: z.string().regex(/^\d{1,2}:\d{2}$/),
    break_2_start: z.string().regex(/^\d{1,2}:\d{2}$/),
    break_2_end: z.string().regex(/^\d{1,2}:\d{2}$/),
    break_3_start: z.string().regex(/^\d{1,2}:\d{2}$/),
    break_3_end: z.string().regex(/^\d{1,2}:\d{2}$/),
  })
  .refine(
    (d) =>
      [1, 2, 3].every((n) => {
        const s = d[`break_${n}_start` as keyof typeof d];
        const e = d[`break_${n}_end` as keyof typeof d];
        return s < e;
      }),
    { message: "各枠は開始 < 終了で入力してください" }
  );

/**
 * 標準休憩時間帯(3枠)を保存する。深夜勤務で休憩をいつ取るかによって深夜割増が
 * 変わらないよう、休憩はこの3枠に取る前提で勤務時間・深夜勤務手当を計算する(§8参照)。
 */
export async function updateBreakWindows(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = breakWindowFieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const rows = [1, 2, 3].flatMap((n) => [
    {
      key: `break_window_${n}_start`,
      value: d[`break_${n}_start` as keyof typeof d].trim(),
    },
    {
      key: `break_window_${n}_end`,
      value: d[`break_${n}_end` as keyof typeof d].trim(),
    },
  ]);
  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/settings");
  return { ok: true, message: "休憩時間を保存しました" };
}

/** 従業員による出退勤時刻・休憩時間の編集ロックをON/OFF切替する。QR打刻自体は影響を受けない。 */
export async function updateTimesheetLock(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const locked = formData.get("lock_employee_time_edit") === "on";

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "lock_employee_time_edit", value: locked ? "true" : "false" },
      { onConflict: "key" }
    );

  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/settings");
  revalidatePath("/timesheet");
  return {
    ok: true,
    message: locked
      ? "従業員による時刻・休憩の編集をロックしました"
      : "従業員による時刻・休憩の編集ロックを解除しました",
  };
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
    // 空行・数字を含まない行(タブ/カンマだけの区切り行など)はスキップする
    .filter((l) => l && !l.startsWith("#") && /\d/.test(l));

  // 各セルは数字以外(「円」・空白・桁区切りカンマ等)を除去して数値化する。
  // 空欄(未満なし等)は null を返す。
  const num = (s: string | undefined): number | null => {
    if (s === undefined) return null;
    const digits = s.replace(/[^\d]/g, "");
    return digits === "" ? null : Number(digits);
  };

  for (const [i, line] of lines.entries()) {
    const cols = line.split(",").map((c) => c.trim());
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

    const row: TaxTableInsertRow = {
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
    };

    // int4 の範囲(約21億)を超える値が混入すると DB 挿入が失敗するため事前に弾く
    const MAX = 2_000_000_000;
    for (const v of Object.values(row)) {
      if (typeof v === "number" && (v < 0 || v > MAX)) {
        return bad(
          "金額が大きすぎます。数値の桁が正しいか(桁区切り以外の文字が混入していないか)確認してください"
        );
      }
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    return { ok: false, message: "有効なデータ行がありません" };
  }

  // 国税庁の月額表の先頭行は「(最小額)円未満 → 0」を表すため、未満(max_amount)が
  // 空欄のまま「以上」に最小額が入った変則行になっている。上限なしの正当な行は
  // 最終行(最大の「以上」)だけなので、それ以外で max_amount が null の行は取り込み対象外にする。
  // (最小「以上」未満は非課税として payroll 側で 0 円と判定する)
  const maxMin = Math.max(...rows.map((r) => r.min_amount));
  const filteredRows = rows.filter(
    (r) => r.max_amount !== null || r.min_amount === maxMin
  );

  if (filteredRows.length === 0) {
    return { ok: false, message: "有効なデータ行がありません" };
  }

  try {
    const supabase = await createClient();

    // 同一年度を入れ替え
    const { error: deleteError } = await supabase
      .from("withholding_tax_table")
      .delete()
      .eq("year", year);
    if (deleteError) {
      return { ok: false, message: "既存データの削除に失敗しました" };
    }

    const { error: insertError } = await supabase
      .from("withholding_tax_table")
      .insert(filteredRows);
    if (insertError) {
      return {
        ok: false,
        message: "登録に失敗しました: " + insertError.message,
      };
    }

    revalidatePath("/admin/settings");
    return {
      ok: true,
      message: `${year}年分の税額表を${filteredRows.length}区分登録しました`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logActivity("エラー", `税額表取り込みに失敗(${year}年): ${msg}`);
    return {
      ok: false,
      message: "取り込み処理でエラーが発生しました: " + msg,
    };
  }
}

const WORK_RULES_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];
const WORK_RULES_MAX_SIZE = 20 * 1024 * 1024; // 20MB
/** ストレージ内の固定パス(拡張子は付けない。実際の種別は work_rules_mime に保存する) */
const WORK_RULES_STORAGE_PATH = "document";

/**
 * 勤務ルール文書(jpg/png/pdf)をアップロードする。既存の文書がある場合は置き換える。
 * Supabase Storage の非公開バケット `work-rules` に固定パスで保存し(常に上書き)、
 * 元のファイル名・MIME種別・アップロード日時を app_settings に記録する
 * (従業員のハンバーガーメニュー「勤務ルール」から閲覧する際に使う)。
 */
export async function uploadWorkRules(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "ファイルを選択してください" };
  }
  if (!WORK_RULES_ALLOWED_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: "jpg・png・pdfファイルのみアップロードできます",
    };
  }
  if (file.size > WORK_RULES_MAX_SIZE) {
    return { ok: false, message: "ファイルサイズは20MB以下にしてください" };
  }

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("work-rules")
    .upload(WORK_RULES_STORAGE_PATH, file, {
      upsert: true,
      contentType: file.type,
    });
  if (uploadError) {
    return {
      ok: false,
      message: "アップロードに失敗しました: " + uploadError.message,
    };
  }

  const rows = [
    { key: "work_rules_path", value: WORK_RULES_STORAGE_PATH },
    { key: "work_rules_filename", value: file.name },
    { key: "work_rules_mime", value: file.type },
    { key: "work_rules_uploaded_at", value: new Date().toISOString() },
  ];
  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: "設定の保存に失敗しました" };

  revalidatePath("/admin/settings");
  return { ok: true, message: `勤務ルール(${file.name})を保存しました` };
}
