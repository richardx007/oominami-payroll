import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  addDaysKey,
  jstTodayKey,
  monthGridKeys,
  type BusinessDayRow,
  type CalendarEventRow,
  type EventTypeRow,
} from "@/lib/business-calendar-view";
import { CalendarManager, type DayDetailRow, type EventDetailRow } from "./ui";

export default async function BusinessCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  await requireAdmin();
  const { ym: ymParam } = await searchParams;
  const today = jstTodayKey();
  const ym = ymParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(ymParam) ? ymParam : today.slice(0, 7);

  const grid = monthGridKeys(ym);
  // 月をまたぐ通し営業の始まり・終わりを正しく出すため、前後に余裕をもって読む
  const from = addDaysKey(grid[0], -14);
  const to = addDaysKey(grid[grid.length - 1], 14);

  const supabase = await createClient();
  const [daysRes, eventsRes, typesRes, monthsRes, holidaysRes, syncRes] = await Promise.all([
    supabase
      .from("business_days")
      .select("date, day_type, holiday_name, status, open_min, close_min, overnight, is_manual, note")
      .gte("date", from)
      .lte("date", to)
      .order("date"),
    supabase
      .from("calendar_events")
      .select("id, start_date, end_date, title, type_id, is_public")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date"),
    supabase.from("calendar_event_types").select("id, name, color, sort_order, is_default").order("sort_order"),
    supabase.from("business_months").select("ym, footnote1, footnote2"),
    supabase.from("jp_holidays").select("date, name").gte("date", grid[0]).lte("date", grid[grid.length - 1]),
    supabase.from("jp_holiday_sync").select("synced_at, last_error").maybeSingle(),
  ]);

  const days = (daysRes.data ?? []) as (BusinessDayRow & DayDetailRow)[];
  const events = (eventsRes.data ?? []) as (CalendarEventRow & EventDetailRow)[];
  const types = (typesRes.data ?? []) as EventTypeRow[];
  const generatedMonths = (monthsRes.data ?? []).map((m) => String(m.ym).slice(0, 7));
  const month = (monthsRes.data ?? []).find((m) => String(m.ym).startsWith(ym));
  const holidays = Object.fromEntries((holidaysRes.data ?? []).map((h) => [h.date, h.name]));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <CalendarManager
        ym={ym}
        today={today}
        days={days}
        events={events}
        types={types}
        generatedMonths={generatedMonths}
        footnotes={[month?.footnote1 ?? "", month?.footnote2 ?? ""]}
        holidays={holidays}
        holidaySyncError={syncRes.data?.last_error ?? null}
      />
    </div>
  );
}
