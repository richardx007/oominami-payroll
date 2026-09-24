/**
 * シフト枠・休憩時間の「適用開始日」ごとの定義（DB: work_time_settings）。
 * 営業時間の定義（business_hour_patterns）と同じ適用開始日でセットになり、
 * 管理画面「営業と勤務時間」でまとめて編集する。
 *
 * 行のキーは従来 app_settings にあったもの（shift_slot_* / break_window_*）と同じ名前なので、
 * その日に有効な行を取り出せば parseSlots() / parseBreakWindows() をそのまま使える。
 * ※DB側の関数 work_setting_at() が同じ規則（キーごとに、その日以前で最も新しい適用開始日の値）を
 *   持つ。**片方だけ変えないこと。**
 */
import type { createClient } from "@/lib/supabase/server";
import { parseBreakWindows, type BreakWindow } from "./breaks";
import { parseSlots, type SlotDef, type SlotKey } from "./shifts";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type WorkTimeSettingRow = { effective_from: string; key: string; value: string };

/** その日に有効な key/value（キーごとに、その日以前で最も新しい適用開始日の値） */
export function workSettingsAt(
  rows: WorkTimeSettingRow[] | null | undefined,
  date: string
): { key: string; value: string }[] {
  const best = new Map<string, WorkTimeSettingRow>();
  for (const r of rows ?? []) {
    if (r.effective_from > date) continue;
    const cur = best.get(r.key);
    if (!cur || r.effective_from > cur.effective_from) best.set(r.key, r);
  }
  return [...best.values()].map(({ key, value }) => ({ key, value }));
}

/** 日付 → その日の休憩時間帯。同じ日付は1回だけ組み立てる */
export function breakWindowsResolver(
  rows: WorkTimeSettingRow[] | null | undefined
): (date: string) => BreakWindow[] {
  const cache = new Map<string, BreakWindow[]>();
  return (date) => {
    let w = cache.get(date);
    if (!w) {
      w = parseBreakWindows(workSettingsAt(rows, date));
      cache.set(date, w);
    }
    return w;
  };
}

/** 日付 → その日のシフト枠。同じ日付は1回だけ組み立てる */
export function slotsResolver(
  rows: WorkTimeSettingRow[] | null | undefined
): (date: string) => Record<SlotKey, SlotDef> {
  const cache = new Map<string, Record<SlotKey, SlotDef>>();
  return (date) => {
    let s = cache.get(date);
    if (!s) {
      s = parseSlots(workSettingsAt(rows, date));
      cache.set(date, s);
    }
    return s;
  };
}

/** 全ての適用開始日の定義を読む（数十行なので毎回全部読む） */
export async function fetchWorkTimeSettings(
  supabase: SupabaseServer
): Promise<WorkTimeSettingRow[]> {
  const { data } = await supabase
    .from("work_time_settings")
    .select("effective_from, key, value");
  return (data ?? []) as WorkTimeSettingRow[];
}
