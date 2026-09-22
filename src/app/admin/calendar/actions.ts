"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import {
  addDaysKey,
  classifyDayType,
  DAY_TYPE_LABELS,
  EVENT_COLOR_KEYS,
  formatMinutes,
  jstTodayKey,
  PATTERN_BASE_DATE,
  regenerateTargetMonths,
  type DayType,
} from "@/lib/business-calendar-view";
import type { ActionResult } from "../employees/actions";

const DAY_TYPES = Object.keys(DAY_TYPE_LABELS) as DayType[];
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function revalidateCalendar() {
  revalidatePath("/admin/calendar", "layout");
}

/** "11/13" */
function md(key: string): string {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

function hoursLabel(open: number | null, close: number | null, overnight: boolean): string {
  if (open == null) return "";
  return `${formatMinutes(open)}〜${overnight ? "通し" : close != null ? formatMinutes(close) : ""}`;
}

// ---------------------------------------------------------------------------
// 営業時間の定義
// ---------------------------------------------------------------------------

const patternSchema = z
  .object({
    day_type: z.enum(DAY_TYPES as [DayType, ...DayType[]]),
    is_open: z.boolean(),
    open_min: z.number().int().min(0).max(1439).nullable(),
    close_min: z.number().int().min(1).max(2880).nullable(),
    overnight: z.boolean(),
  })
  .refine((p) => !p.is_open || p.open_min != null, { message: "開店時刻を入力してください" })
  .refine((p) => !p.is_open || p.overnight || (p.close_min != null && p.open_min != null && p.close_min > p.open_min), {
    message: "閉店時刻は開店時刻より後にしてください（深夜は 26:00 のように書きます）",
  });

/** 適用開始日の表記（最初の定義は日付を出さない） */
function effectiveLabel(effectiveFrom: string): string {
  return effectiveFrom === PATTERN_BASE_DATE
    ? "最初の定義"
    : `${Number(effectiveFrom.slice(0, 4))}/${md(effectiveFrom)}からの定義`;
}

/**
 * 作成済みの月のうち、この適用開始日の定義で変わりうる月を作り直す（手で直した日はそのまま）。
 * 対象の決め方は regenerateTargetMonths()。
 */
async function regenerateMonthsFrom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  effectiveFrom: string
): Promise<{ done: string[]; error?: string }> {
  const today = jstTodayKey();
  const { data: months } = await supabase.from("business_months").select("ym").gte("ym", `${today.slice(0, 7)}-01`);
  const targets = regenerateTargetMonths(
    (months ?? []).map((m) => String(m.ym).slice(0, 7)),
    effectiveFrom,
    today
  );
  const done: string[] = [];
  for (const ym of targets) {
    const { error } = await supabase.rpc("generate_business_month", { p_ym: `${ym}-01`, p_regenerate: true });
    if (error) return { done, error: error.message };
    done.push(`${Number(ym.slice(5, 7))}月`);
  }
  return { done };
}

/**
 * 営業時間の定義（1つの適用開始日の6区分）を保存する。新しい適用開始日ならその定義を追加する。
 * regenerate=true なら、この定義で変わる作成済みの月を作り直す（手で直した日はそのまま）。
 */
export async function saveHourPatterns(
  effectiveFrom: string,
  patterns: z.input<typeof patternSchema>[],
  regenerate: boolean
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!dateKey.safeParse(effectiveFrom).success || effectiveFrom < PATTERN_BASE_DATE) {
    return { ok: false, message: "適用開始日を入力してください" };
  }
  const parsed = z.array(patternSchema).length(DAY_TYPES.length).safeParse(patterns);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const idx = typeof issue.path[0] === "number" ? issue.path[0] : -1;
    const label = idx >= 0 ? `「${DAY_TYPE_LABELS[patterns[idx].day_type as DayType]}」: ` : "";
    return { ok: false, message: label + issue.message };
  }
  if (new Set(parsed.data.map((p) => p.day_type)).size !== DAY_TYPES.length) {
    return { ok: false, message: "区分がそろっていません" };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const rows = parsed.data.map((p) => ({
    day_type: p.day_type,
    effective_from: effectiveFrom,
    is_open: p.is_open,
    open_min: p.is_open ? p.open_min : null,
    close_min: p.is_open && !p.overnight ? p.close_min : null,
    overnight: p.is_open && p.overnight,
    updated_at: now,
    updated_by: admin.id,
  }));
  const { error } = await supabase
    .from("business_hour_patterns")
    .upsert(rows, { onConflict: "day_type,effective_from" });
  if (error) return { ok: false, message: "保存に失敗しました" };

  await logActivity(
    "営業時間の定義を変更",
    `${effectiveLabel(effectiveFrom)}: ` +
      rows
        .map((r) => `${DAY_TYPE_LABELS[r.day_type]} ${r.is_open ? hoursLabel(r.open_min, r.close_min, r.overnight) : "定休"}`)
        .join(" / ")
  );

  let message = `${effectiveLabel(effectiveFrom)}を保存しました`;
  if (regenerate) {
    const { done, error: genError } = await regenerateMonthsFrom(supabase, effectiveFrom);
    if (genError) return { ok: false, message: `定義は保存しましたが、作り直しに失敗しました（${genError}）` };
    message += done.length ? `。${done.join("・")}を作り直しました` : "。作り直す月はありませんでした";
  }

  revalidateCalendar();
  return { ok: true, message };
}

/** 適用開始日ごとの定義を削除する（最初の定義は削除できない）。regenerate は保存と同じ。 */
export async function deleteHourPatterns(effectiveFrom: string, regenerate: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!dateKey.safeParse(effectiveFrom).success || effectiveFrom <= PATTERN_BASE_DATE) {
    return { ok: false, message: "最初の定義は削除できません" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hour_patterns")
    .delete()
    .eq("effective_from", effectiveFrom)
    .select("day_type");
  if (error || !data?.length) return { ok: false, message: "削除に失敗しました" };
  await logActivity("営業時間の定義を削除", effectiveLabel(effectiveFrom));

  let message = `${effectiveLabel(effectiveFrom)}を削除しました`;
  if (regenerate) {
    const { done, error: genError } = await regenerateMonthsFrom(supabase, effectiveFrom);
    if (genError) return { ok: false, message: `定義は削除しましたが、作り直しに失敗しました（${genError}）` };
    message += done.length ? `。${done.join("・")}を作り直しました` : "";
  }

  revalidateCalendar();
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// 月の作成
// ---------------------------------------------------------------------------

export async function generateMonth(ym: string): Promise<ActionResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, message: "月の指定が正しくありません" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_business_month", { p_ym: `${ym}-01` });
  if (error) return { ok: false, message: error.message };
  revalidateCalendar();
  return { ok: true, message: `${Number(ym.slice(5, 7))}月の営業カレンダーを作成しました` };
}

// ---------------------------------------------------------------------------
// 日の変更
// ---------------------------------------------------------------------------

const dayEditSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("usual"), date: dateKey }),
  z.object({ mode: z.literal("closed"), date: dateKey, note: z.string().max(200) }),
  z.object({
    mode: z.literal("hours"),
    date: dateKey,
    open_min: z.number().int().min(0).max(1439),
    close_min: z.number().int().min(1).max(2880).nullable(),
    overnight: z.boolean(),
    note: z.string().max(200),
  }),
]);

/** 日をタップして「いつもどおり／時間を変える／臨時休業」を保存する */
export async function saveDay(input: z.input<typeof dayEditSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = dayEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "入力内容を確認してください" };
  const d = parsed.data;
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: current } = await supabase.from("business_days").select("date").eq("date", d.date).maybeSingle();
  if (!current) return { ok: false, message: "この月はまだ作成されていません" };

  if (d.mode === "usual") {
    // 定義から作り直す（区分は今の祝日データで判定し直す）
    const { data: hol } = await supabase
      .from("jp_holidays")
      .select("date, name")
      .in("date", [d.date, addDaysKey(d.date, 1)]);
    const holidays = Object.fromEntries((hol ?? []).map((h) => [h.date, h.name]));
    const dayType = classifyDayType(d.date, holidays);
    const { data: p } = await supabase
      .from("business_hour_patterns")
      .select("*")
      .eq("day_type", dayType)
      .lte("effective_from", d.date)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!p) return { ok: false, message: "営業時間の定義が見つかりません" };
    const { error } = await supabase
      .from("business_days")
      .update({
        day_type: dayType,
        holiday_name: holidays[d.date] ?? null,
        status: p.is_open ? "open" : "closed",
        open_min: p.is_open ? p.open_min : null,
        close_min: p.is_open && !p.overnight ? p.close_min : null,
        overnight: p.is_open && p.overnight,
        is_manual: false,
        note: null,
        updated_at: now,
        updated_by: admin.id,
      })
      .eq("date", d.date);
    if (error) return { ok: false, message: "保存に失敗しました" };
    await logActivity("営業カレンダー変更", `${md(d.date)} いつもどおりに戻す`);
  } else if (d.mode === "closed") {
    const { error } = await supabase
      .from("business_days")
      .update({
        status: "temp_closed",
        open_min: null,
        close_min: null,
        overnight: false,
        is_manual: true,
        note: d.note.trim() || null,
        updated_at: now,
        updated_by: admin.id,
      })
      .eq("date", d.date);
    if (error) return { ok: false, message: "保存に失敗しました" };
    await logActivity("営業カレンダー変更", `${md(d.date)} 臨時休業`);
  } else {
    if (!d.overnight && (d.close_min == null || d.close_min <= d.open_min)) {
      return { ok: false, message: "閉店時刻は開店時刻より後にしてください（深夜は 26:00 のように書きます）" };
    }
    const { error } = await supabase
      .from("business_days")
      .update({
        status: "open",
        open_min: d.open_min,
        close_min: d.overnight ? null : d.close_min,
        overnight: d.overnight,
        is_manual: true,
        note: d.note.trim() || null,
        updated_at: now,
        updated_by: admin.id,
      })
      .eq("date", d.date);
    if (error) return { ok: false, message: "保存に失敗しました" };
    await logActivity(
      "営業カレンダー変更",
      `${md(d.date)} 時間変更 ${hoursLabel(d.open_min, d.close_min, d.overnight)}`
    );
  }

  revalidateCalendar();
  return { ok: true, message: `${md(d.date)} を保存しました` };
}

// ---------------------------------------------------------------------------
// イベント
// ---------------------------------------------------------------------------

const eventSchema = z
  .object({
    id: z.uuid().nullable(),
    title: z.string().trim().min(1, "タイトルを入力してください").max(40, "タイトルは40文字までです"),
    start_date: dateKey,
    end_date: dateKey,
    type_id: z.uuid().nullable(),
    is_public: z.boolean(),
  })
  .refine((e) => e.end_date >= e.start_date, { message: "終了日は開始日以降にしてください" });

export async function saveEvent(input: z.input<typeof eventSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const e = parsed.data;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const fields = {
    title: e.title,
    start_date: e.start_date,
    end_date: e.end_date,
    type_id: e.type_id,
    is_public: e.is_public,
    updated_at: now,
    updated_by: admin.id,
  };
  const { error } = e.id
    ? await supabase.from("calendar_events").update(fields).eq("id", e.id)
    : await supabase.from("calendar_events").insert({ ...fields, created_by: admin.id });
  if (error) return { ok: false, message: "保存に失敗しました" };

  const range = e.start_date === e.end_date ? md(e.start_date) : `${md(e.start_date)}〜${md(e.end_date)}`;
  await logActivity(e.id ? "営業カレンダーのイベント変更" : "営業カレンダーのイベント追加", `${range} ${e.title}`);
  revalidateCalendar();
  return { ok: true, message: `「${e.title}」を保存しました` };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "指定が正しくありません" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .select("title, start_date")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "削除に失敗しました" };
  await logActivity("営業カレンダーのイベント削除", `${md(data.start_date)} ${data.title}`);
  revalidateCalendar();
  return { ok: true, message: `「${data.title}」を削除しました` };
}

// ---------------------------------------------------------------------------
// イベントの種類と色（設定画面）
// ---------------------------------------------------------------------------

const typeSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "名前を入力してください").max(12, "名前は12文字までです"),
  color: z.enum(EVENT_COLOR_KEYS as [string, ...string[]]),
});

export async function saveEventType(input: z.input<typeof typeSchema>): Promise<ActionResult> {
  await requireAdmin();
  const parsed = typeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const t = parsed.data;
  const supabase = await createClient();

  let error;
  if (t.id) {
    ({ error } = await supabase.from("calendar_event_types").update({ name: t.name, color: t.color }).eq("id", t.id));
  } else {
    const { data: last } = await supabase
      .from("calendar_event_types")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase
      .from("calendar_event_types")
      .insert({ name: t.name, color: t.color, sort_order: (last?.sort_order ?? 0) + 1 }));
  }
  if (error) return { ok: false, message: "保存に失敗しました" };

  await logActivity(t.id ? "イベントの種類を変更" : "イベントの種類を追加", `${t.name}（${t.color}）`);
  revalidatePath("/admin/settings");
  revalidateCalendar();
  return { ok: true, message: `「${t.name}」を保存しました` };
}

export async function deleteEventType(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "指定が正しくありません" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_event_types")
    .delete()
    .eq("id", id)
    .eq("is_default", false)
    .select("name")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "削除できませんでした（既定の種類は削除できません）" };
  await logActivity("イベントの種類を削除", data.name);
  revalidatePath("/admin/settings");
  revalidateCalendar();
  return { ok: true, message: `「${data.name}」を削除しました。この種類のイベントは既定の種類で表示されます` };
}
