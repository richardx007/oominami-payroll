import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { jstTodayKey, type HourPattern } from "@/lib/business-calendar-view";
import type { WorkTimeSettingRow } from "@/lib/work-time";
import { PatternsForm } from "./ui";

export default async function HourPatternsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = jstTodayKey();
  const [patternsRes, workTimeRes, holidaysRes, monthsRes] = await Promise.all([
    supabase
      .from("business_hour_patterns")
      .select("day_type, effective_from, is_open, open_min, close_min, overnight")
      .order("effective_from"),
    // シフト枠・休憩時間（営業時間と同じ適用開始日でセット）
    supabase.from("work_time_settings").select("effective_from, key, value"),
    // 結果例（2026年9月の連休）の判定用
    supabase.from("jp_holidays").select("date, name").gte("date", "2026-09-01").lte("date", "2026-10-01"),
    // 作り直しの対象になりうる月（今月以降の作成済みの月）
    supabase.from("business_months").select("ym").gte("ym", `${today.slice(0, 7)}-01`),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PatternsForm
        patterns={(patternsRes.data ?? []) as HourPattern[]}
        workTimeSettings={(workTimeRes.data ?? []) as WorkTimeSettingRow[]}
        exampleHolidays={Object.fromEntries((holidaysRes.data ?? []).map((h) => [h.date, h.name]))}
        createdMonths={(monthsRes.data ?? []).map((m) => String(m.ym).slice(0, 7))}
        today={today}
      />
    </div>
  );
}
