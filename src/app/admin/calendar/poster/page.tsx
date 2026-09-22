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
import { PosterView } from "./ui";

export default async function CalendarPosterPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  await requireAdmin();
  const { ym: ymParam } = await searchParams;
  const ym = ymParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(ymParam) ? ymParam : jstTodayKey().slice(0, 7);

  const grid = monthGridKeys(ym);
  // 月をまたぐ通し営業を正しく出すため前後に余裕をもって読む
  const from = addDaysKey(grid[0], -14);
  const to = addDaysKey(grid[grid.length - 1], 14);

  const supabase = await createClient();
  const [daysRes, eventsRes, typesRes, holidaysRes, monthRes] = await Promise.all([
    supabase
      .from("business_days")
      .select("date, holiday_name, status, open_min, close_min, overnight")
      .gte("date", from)
      .lte("date", to)
      .order("date"),
    // 掲示物なので公開イベントだけ
    supabase
      .from("calendar_events")
      .select("id, start_date, end_date, title, type_id")
      .eq("is_public", true)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date"),
    supabase.from("calendar_event_types").select("id, name, color, sort_order, is_default").order("sort_order"),
    supabase.from("jp_holidays").select("date, name").gte("date", grid[0]).lte("date", grid[grid.length - 1]),
    supabase.from("business_months").select("footnote1, footnote2").eq("ym", `${ym}-01`).maybeSingle(),
  ]);

  return (
    <PosterView
      ym={ym}
      days={(daysRes.data ?? []) as BusinessDayRow[]}
      events={(eventsRes.data ?? []) as CalendarEventRow[]}
      types={(typesRes.data ?? []) as EventTypeRow[]}
      holidays={Object.fromEntries((holidaysRes.data ?? []).map((h) => [h.date, h.name]))}
      footnotes={[monthRes.data?.footnote1, monthRes.data?.footnote2].filter((l): l is string => !!l)}
    />
  );
}
