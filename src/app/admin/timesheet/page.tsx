import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod, periodFromKey, todayJST } from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { TimesheetCalendar } from "@/app/(employee)/timesheet/ui";
import type { WorkEntry } from "@/app/(employee)/timesheet/page";
import { adminUpsertWorkEntry, adminDeleteWorkEntry } from "./actions";

export default async function AdminTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; e?: string }>;
}) {
  await requireAdmin();
  const { p, e } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();

  // 対象従業員の一覧(在籍・非管理者)
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("status", "active")
    .eq("is_admin", false)
    .order("employee_no");

  const list = employees ?? [];
  const selectedId = (e && list.some((x) => x.id === e) ? e : list[0]?.id) ?? "";

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">勤務表</h1>
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          対象の従業員が登録されていません。
        </p>
      </div>
    );
  }

  const [{ data: entries }, { data: pastEntries }] = await Promise.all([
    supabase
      .from("work_entries")
      .select(
        "work_date, start_time, end_time, break_minutes, transport_cost, transport_mode, station_from, station_to, round_trip, note"
      )
      .eq("employee_id", selectedId)
      .gte("work_date", period.start)
      .lte("work_date", period.end)
      .order("work_date"),
    supabase
      .from("work_entries")
      .select("station_from, station_to")
      .eq("employee_id", selectedId)
      .order("work_date", { ascending: false })
      .limit(200),
  ]);

  const normalized = (entries ?? []).map((row) => ({
    ...row,
    start_time: row.start_time.slice(0, 5),
    end_time: row.end_time.slice(0, 5),
  }));

  const stationSet = new Set<string>();
  for (const row of pastEntries ?? []) {
    if (row.station_from) stationSet.add(row.station_from);
    if (row.station_to) stationSet.add(row.station_to);
  }

  const years = Array.from(
    new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])
  );
  const holidays = await fetchJapaneseHolidays(years);

  return (
    <div className="space-y-4">
      <TimesheetCalendar
        period={period}
        entries={normalized as WorkEntry[]}
        // 管理者は締め済みでも修正できるよう常に編集可能
        closed={false}
        stations={[...stationSet].sort()}
        holidays={holidays}
        today={todayJST()}
        save={adminUpsertWorkEntry.bind(null, selectedId)}
        del={adminDeleteWorkEntry.bind(null, selectedId)}
        basePath="/admin/timesheet"
        employees={list}
        selectedEmployeeId={selectedId}
      />
    </div>
  );
}
