import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  adjacentPeriodKey,
  currentPeriod,
  periodFromKey,
  todayJST,
  workMinutes,
} from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { periodStatusBadgeClass, periodStatusLabel } from "@/lib/period-status";
import { DashboardCalendar, type DayPerson } from "./DashboardCalendar";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireAdmin();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();

  const [{ data: employees }, { data: entries }, { data: payPeriod }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_no, name, auth_user_id")
        .eq("status", "active")
        .eq("is_admin", false)
        .order("employee_no"),
      supabase
        .from("work_entries")
        .select(
          "employee_id, work_date, start_time, end_time, break_minutes, transport_cost, updated_at"
        )
        .gte("work_date", period.start)
        .lte("work_date", period.end),
      supabase
        .from("pay_periods")
        .select("status")
        .eq("start_date", period.start)
        .eq("end_date", period.end)
        .maybeSingle(),
    ]);

  const nameById = new Map(
    (employees ?? []).map((e) => [e.id, e.name] as const)
  );

  // 日別の勤務者(カレンダー用)
  const personsByDate: Record<string, DayPerson[]> = {};

  for (const e of entries ?? []) {
    const minutes = workMinutes(
      e.start_time.slice(0, 5),
      e.end_time.slice(0, 5),
      e.break_minutes
    );

    (personsByDate[e.work_date] ??= []).push({
      employee_id: e.employee_id,
      name: nameById.get(e.employee_id) ?? "(不明)",
      start: e.start_time.slice(0, 5),
      end: e.end_time.slice(0, 5),
      minutes,
      transport: e.transport_cost,
    });
  }
  for (const list of Object.values(personsByDate)) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  const years = Array.from(
    new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])
  );
  const holidays = await fetchJapaneseHolidays(years);

  const status = payPeriod?.status ?? "open";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm font-medium text-gray-500">
            入力状況ダッシュボード
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900">
              {period.label}
            </span>
            <span className={periodStatusBadgeClass(status)}>
              {periodStatusLabel(status)}
            </span>
            <div className="flex gap-2 text-sm">
              <Link
                href={`/admin?p=${adjacentPeriodKey(period.key, -1)}`}
                className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-200"
              >
                ← 前月
              </Link>
              <Link
                href={`/admin?p=${adjacentPeriodKey(period.key, 1)}`}
                className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-200"
              >
                翌月 →
              </Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {period.start.replaceAll("-", "/")} 〜{" "}
            {period.end.replaceAll("-", "/")}
          </p>
        </div>
      </div>

      {/* 勤務カレンダー(日別の勤務人数 + 日クリックで勤務者一覧)。
          カレンダー右の一覧は iPhone ではカレンダーの下に表示される(DashboardCalendar 内で対応)。 */}
      <DashboardCalendar
        period={period}
        personsByDate={personsByDate}
        holidays={holidays}
        today={todayJST()}
      />
    </div>
  );
}
