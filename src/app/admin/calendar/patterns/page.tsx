import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { jstTodayKey, type HourPattern } from "@/lib/business-calendar-view";
import type { WorkTimeSettingRow } from "@/lib/work-time";
import { ClockMenuForm, ShiftMonthStartForm, TimesheetLockForm } from "../../settings/ui";
import { ClockSettingsForm } from "../../settings/clock";
import { PatternsForm } from "./ui";

/** シフト予定表・勤務表ロック・QR打刻の位置設定で読む app_settings のキー */
const SETTING_KEYS = [
  "company_name",
  "shift_month_start",
  "lock_employee_time_edit",
  "clock_menu_enabled",
  "clock_base_lat",
  "clock_base_lng",
  "clock_radius_m",
  "clock_out_of_range",
  "clock_round_min",
];

export default async function HourPatternsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = jstTodayKey();
  const [patternsRes, workTimeRes, holidaysRes, monthsRes, settingsRes] = await Promise.all([
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
    supabase.from("app_settings").select("key, value").in("key", SETTING_KEYS),
  ]);
  const settings = new Map((settingsRes.data ?? []).map((s) => [s.key, s.value]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PatternsForm
        patterns={(patternsRes.data ?? []) as HourPattern[]}
        workTimeSettings={(workTimeRes.data ?? []) as WorkTimeSettingRow[]}
        exampleHolidays={Object.fromEntries((holidaysRes.data ?? []).map((h) => [h.date, h.name]))}
        createdMonths={(monthsRes.data ?? []).map((m) => String(m.ym).slice(0, 7))}
        today={today}
      />
      {/* 2026-10-12: シフト予定表・勤務表ロック・QR打刻の位置設定を設定画面から移した(オーナー依頼) */}
      <ShiftMonthStartForm monthStart={settings.get("shift_month_start") === "1"} />
      <TimesheetLockForm locked={settings.get("lock_employee_time_edit") === "true"} />
      <ClockMenuForm enabled={settings.get("clock_menu_enabled") === "true"} />
      <ClockSettingsForm
        companyName={settings.get("company_name") ?? ""}
        lat={settings.get("clock_base_lat") ?? ""}
        lng={settings.get("clock_base_lng") ?? ""}
        radiusM={settings.get("clock_radius_m") ?? ""}
        policy={settings.get("clock_out_of_range") ?? "warn"}
        roundMin={settings.get("clock_round_min") ?? "0"}
      />
    </div>
  );
}
