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
    // 退勤未入力(end_time が null)は勤務時間を計算しない
    const end = e.end_time ? e.end_time.slice(0, 5) : null;
    const minutes = end
      ? workMinutes(e.start_time.slice(0, 5), end, e.break_minutes)
      : null;

    (personsByDate[e.work_date] ??= []).push({
      employee_id: e.employee_id,
      name: nameById.get(e.employee_id) ?? "(不明)",
      start: e.start_time.slice(0, 5),
      end,
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
      <div className="flex flex-wrap items-center gap-3">
        {/* 前月/翌月は勤務表と同様に ＜ ＞ を年月の左右に配置して1行に収める */}
        <div className="flex items-center gap-1.5">
          <Link
            href={`/admin?p=${adjacentPeriodKey(period.key, -1)}`}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </Link>
          <span className="text-xl font-extrabold tracking-tight text-blue-800">
            {period.label}
          </span>
          <Link
            href={`/admin?p=${adjacentPeriodKey(period.key, 1)}`}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </Link>
        </div>
        <span className={periodStatusBadgeClass(status)}>
          {periodStatusLabel(status)}
        </span>
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
