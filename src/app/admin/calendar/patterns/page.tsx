import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { addMonthsYm, jstTodayKey, type HourPattern } from "@/lib/business-calendar-view";
import { PatternsForm } from "./ui";

export default async function HourPatternsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = jstTodayKey();
  const [patternsRes, holidaysRes, monthsRes] = await Promise.all([
    supabase.from("business_hour_patterns").select("day_type, is_open, open_min, close_min, overnight"),
    // 結果例（2026年9月の連休）の判定用
    supabase.from("jp_holidays").select("date, name").gte("date", "2026-09-01").lte("date", "2026-10-01"),
    supabase.from("business_months").select("ym").gte("ym", `${addMonthsYm(today.slice(0, 7), 2)}-01`),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PatternsForm
        patterns={(patternsRes.data ?? []) as HourPattern[]}
        exampleHolidays={Object.fromEntries((holidaysRes.data ?? []).map((h) => [h.date, h.name]))}
        draftMonths={(monthsRes.data ?? []).map((m) => String(m.ym).slice(0, 7))}
      />
    </div>
  );
}
