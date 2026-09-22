"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { CalendarData } from "@/components/business-calendar/PublicCalendar";

const dateKey = /^\d{4}-\d{2}-\d{2}$/;

/**
 * プレビュー用（管理者のみ）: 準備中の月も含めて、HPと同じ形のデータを返す。
 * 公開用の public_business_calendar() と同じく、非公開イベント・メモは含めない。
 */
export async function loadPreviewCalendar(from: string, to: string): Promise<CalendarData> {
  await requireAdmin();
  if (!dateKey.test(from) || !dateKey.test(to)) throw new Error("invalid range");
  const supabase = await createClient();
  const [days, events, types, notes] = await Promise.all([
    supabase
      .from("business_days")
      .select("date, holiday_name, status, open_min, close_min, overnight")
      .gte("date", from)
      .lte("date", to)
      .order("date"),
    supabase
      .from("calendar_events")
      .select("id, start_date, end_date, title, type_id")
      .eq("is_public", true)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date"),
    supabase.from("calendar_event_types").select("id, name, color, sort_order, is_default").order("sort_order"),
    supabase
      .from("business_months")
      .select("ym, footnote")
      .gte("ym", `${from.slice(0, 7)}-01`)
      .lte("ym", to),
  ]);
  if (days.error || events.error || types.error || notes.error) throw new Error("load failed");
  return {
    days: days.data,
    events: events.data,
    types: types.data,
    notes: notes.data.map((n) => ({ ...n, ym: String(n.ym).slice(0, 7) })),
  } as CalendarData;
}
