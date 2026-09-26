"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import {
  normalizeSealSizeMm,
  SEAL_ALLOWED_TYPES,
  SEAL_MAX_SIZE,
} from "@/lib/payslip-issuer";
import {
  audienceLabel,
  GUIDE_SUMMARY_MAX,
  GUIDE_TITLE_MAX,
  GUIDE_VIDEO_BUCKET,
  GUIDE_VIDEO_PATH_RE,
} from "@/lib/app-guides";
import type { ActionResult } from "../employees/actions";

const emailSettingsSchema = z.object({
  company_name: z.string().max(100),
  manager_name: z.string().max(100),
  gmail_user: z.union([z.literal(""), z.email("送信元メールの形式が正しくありません")]),
  tax_accountant_name: z.string().max(200),
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
    { key: "manager_name", value: d.manager_name.trim() },
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

/**
 * シフト予定表を「1日始まり」で表示するかを保存する。
 * シフト枠・休憩時間は「営業と勤務時間」(admin/calendar/actions.ts の saveHourPatterns)で保存する。
 */
export async function updateShiftMonthStart(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  // チェックボックスはチェック時のみ "on" が送られる(未チェックは欠落)
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "shift_month_start", value: formData.get("month_start") ? "1" : "0" },
      { onConflict: "key" }
    );
  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/shifts");
  return { ok: true, message: "シフト予定表の設定を保存しました" };
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

    // 2026-08-22: 税額表は設定画面から独立したメニュー(/admin/tax-table)に移動した
    revalidatePath("/admin/tax-table");
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

/**
 * メニュー「勤務ルール」の表示方法を保存する。
 * generated=「営業と勤務時間」の定義から組み立てた画面(既定) / image=アップロードした文書。
 */
export async function updateWorkRulesMode(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const mode = formData.get("mode");
  if (mode !== "generated" && mode !== "image") {
    return { ok: false, message: "表示方法を選んでください" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "work_rules_mode", value: mode }, { onConflict: "key" });
  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/settings");
  revalidatePath("/work-rules");
  return {
    ok: true,
    message: mode === "image" ? "アップロードした文書を表示します" : "「営業と勤務時間」から作った画面を表示します",
  };
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


const payslipIssuerSchema = z.object({
  payslip_payer_line1: z.string().max(100),
  payslip_payer_line2: z.string().max(100),
  /** 印の印字サイズ(mm)。許可値以外は normalizeSealSizeMm が既定値に丸める */
  payslip_seal_size_mm: z.string().optional(),
  // 「印を削除する」チェックボックス。チェック時のみ "on" が送られる
  remove_seal: z.string().optional(),
});

/**
 * 給与明細PDFの右上に印字する「支払元(2行)」と「印」の画像を保存する。
 * 印はファイルを選んだときだけ差し替え、選ばなければ現在の登録を保つ
 * (「印を削除する」にチェックすると消す)。
 * 画像は data URL にして app_settings に保持する(理由は lib/payslip-issuer.ts のコメント)。
 */
export async function updatePayslipIssuer(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = payslipIssuerSchema.safeParse({
    payslip_payer_line1: formData.get("payslip_payer_line1") ?? "",
    payslip_payer_line2: formData.get("payslip_payer_line2") ?? "",
    payslip_seal_size_mm: formData.get("payslip_seal_size_mm") ?? undefined,
    remove_seal: formData.get("remove_seal") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  const rows: { key: string; value: string }[] = [
    { key: "payslip_payer_line1", value: d.payslip_payer_line1.trim() },
    { key: "payslip_payer_line2", value: d.payslip_payer_line2.trim() },
    {
      key: "payslip_seal_size_mm",
      value: String(normalizeSealSizeMm(d.payslip_seal_size_mm)),
    },
  ];

  const seal = formData.get("seal");
  if (seal instanceof File && seal.size > 0) {
    if (!SEAL_ALLOWED_TYPES.includes(seal.type)) {
      return { ok: false, message: "印の画像は png・jpg のみ登録できます" };
    }
    if (seal.size > SEAL_MAX_SIZE) {
      return {
        ok: false,
        message: `印の画像は${Math.floor(SEAL_MAX_SIZE / 1024)}KB以下にしてください`,
      };
    }
    // Node の Buffer は使わず Web標準の btoa で base64 化する(Cloudflare Workers 上で動くため)。
    // 1バイトずつ文字列連結すると遅いので、まとめて String.fromCharCode に渡す。
    const bytes = new Uint8Array(await seal.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(bin);
    rows.push(
      { key: "payslip_seal_data_url", value: `data:${seal.type};base64,${base64}` },
      { key: "payslip_seal_filename", value: seal.name }
    );
  } else if (d.remove_seal) {
    rows.push(
      { key: "payslip_seal_data_url", value: "" },
      { key: "payslip_seal_filename", value: "" }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: "保存に失敗しました" };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/close");
  return { ok: true, message: "給与明細PDFの支払元・印を保存しました" };
}

// ---- アプリの解説（操作説明の動画・資料へのリンク）----

// 動画はブラウザから Storage へ直接アップロードし（Workers を通すと CPU 時間・リクエストサイズの上限に当たる）、
// ここでは保存先のパスと大きさだけを受け取って記録する。
const guideSchema = z
  .object({
    id: z.uuid().nullable(),
    title: z.string().trim().min(1, "タイトルを入力してください").max(GUIDE_TITLE_MAX, `タイトルは${GUIDE_TITLE_MAX}文字までです`),
    kind: z.enum(["video", "url"]),
    url: z.string().trim().max(1000, "URLが長すぎます"),
    video_path: z.string().nullable(),
    video_size: z.number().int().nonnegative().nullable(),
    summary: z.string().trim().max(GUIDE_SUMMARY_MAX, `概略は${GUIDE_SUMMARY_MAX}文字までです`),
    for_admin: z.boolean(),
    for_employee: z.boolean(),
  })
  .refine((g) => g.for_admin || g.for_employee, { message: "公開対象を1つ以上選んでください" })
  .refine((g) => g.kind !== "url" || /^https?:\/\/\S+$/.test(g.url), {
    message: "URLは https:// から始まる形で入力してください",
  })
  .refine((g) => g.kind !== "video" || (g.video_path != null && GUIDE_VIDEO_PATH_RE.test(g.video_path)), {
    message: "動画ファイルを選んでください",
  });

function revalidateGuides() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/guides");
  revalidatePath("/guides");
}

/** 使わなくなった動画を Storage から消す（失敗しても保存自体は成功扱い。容量が残るだけ） */
async function removeGuideVideo(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(GUIDE_VIDEO_BUCKET).remove([path]);
}

export async function saveAppGuide(input: z.input<typeof guideSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = guideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const g = parsed.data;
  const supabase = await createClient();
  const isVideo = g.kind === "video";
  const row = {
    title: g.title,
    url: isVideo ? null : g.url,
    video_path: isVideo ? g.video_path : null,
    video_size: isVideo ? g.video_size : null,
    summary: g.summary,
    for_admin: g.for_admin,
    for_employee: g.for_employee,
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };

  let error;
  let oldVideo: string | null = null;
  if (g.id) {
    const { data: before } = await supabase.from("app_guides").select("video_path").eq("id", g.id).maybeSingle();
    oldVideo = before?.video_path ?? null;
    ({ error } = await supabase.from("app_guides").update(row).eq("id", g.id));
  } else {
    const { data: last } = await supabase
      .from("app_guides")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase.from("app_guides").insert({ ...row, sort_order: (last?.sort_order ?? 0) + 1 }));
  }
  if (error) return { ok: false, message: "保存に失敗しました" };
  // 動画を差し替えた・URL に切り替えた場合は、前の動画を消す
  if (oldVideo && oldVideo !== row.video_path) await removeGuideVideo(supabase, oldVideo);

  await logActivity(
    g.id ? "アプリの解説を変更" : "アプリの解説を追加",
    `${g.title}（${isVideo ? "動画" : "URL"}・${audienceLabel(g)}）`
  );
  revalidateGuides();
  return { ok: true, message: `「${g.title}」を保存しました` };
}

export async function deleteAppGuide(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "指定が正しくありません" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_guides")
    .delete()
    .eq("id", id)
    .select("title, video_path")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "削除できませんでした" };
  await removeGuideVideo(supabase, data.video_path);
  await logActivity("アプリの解説を削除", data.title);
  revalidateGuides();
  return { ok: true, message: `「${data.title}」を削除しました` };
}

/** アップロードしたが保存しなかった動画を消す（保存に失敗したとき・やめたとき）。どこからも使われていないものだけ */
export async function discardGuideVideo(path: string): Promise<void> {
  await requireAdmin();
  if (!GUIDE_VIDEO_PATH_RE.test(path)) return;
  const supabase = await createClient();
  const { data: used } = await supabase.from("app_guides").select("id").eq("video_path", path).maybeSingle();
  if (!used) await removeGuideVideo(supabase, path);
}

/** 並び順を1つ上（-1）または下（+1）へ。隣の項目と sort_order を入れ替える */
export async function moveAppGuide(id: string, dir: -1 | 1): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "指定が正しくありません" };
  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("app_guides").select("id, sort_order").order("sort_order").order("created_at");
  if (error || !rows) return { ok: false, message: "並べ替えに失敗しました" };
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return { ok: true, message: "" };
  // sort_order が重複していても確実に入れ替わるよう、一覧の位置で振り直す
  const order = rows.map((r) => r.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (let k = 0; k < order.length; k++) {
    const { error: e } = await supabase.from("app_guides").update({ sort_order: k + 1 }).eq("id", order[k]);
    if (e) return { ok: false, message: "並べ替えに失敗しました" };
  }
  revalidateGuides();
  return { ok: true, message: "" };
}
