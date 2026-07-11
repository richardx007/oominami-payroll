import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  adjacentPeriodKey,
  currentPeriod,
  formatMinutes,
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

  // 人別集計(カレンダー下の一覧用)
  const byEmployee = new Map<
    string,
    { days: number; minutes: number; transport: number; lastUpdated: string }
  >();
  // 日別の勤務者(カレンダー用)
  const personsByDate: Record<string, DayPerson[]> = {};

  for (const e of entries ?? []) {
    const minutes = workMinutes(
      e.start_time.slice(0, 5),
      e.end_time.slice(0, 5),
      e.break_minutes
    );

    const cur = byEmployee.get(e.employee_id) ?? {
      days: 0,
      minutes: 0,
      transport: 0,
      lastUpdated: "",
    };
    cur.days += 1;
    cur.minutes += minutes;
    cur.transport += e.transport_cost;
    if (e.updated_at > cur.lastUpdated) cur.lastUpdated = e.updated_at;
    byEmployee.set(e.employee_id, cur);

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

      {/* 上部: 勤務カレンダー(日別の勤務人数 + 日クリックで勤務者一覧) */}
      <DashboardCalendar
        period={period}
        personsByDate={personsByDate}
        holidays={holidays}
        today={todayJST()}
      />

      {/* 下部: 人別の入力状況一覧 */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-blue-200 bg-blue-100 text-left text-xs font-semibold text-gray-700">
                <th className="px-4 py-2">No</th>
                <th className="px-4 py-2">氏名</th>
                <th className="px-4 py-2 text-right">勤務日数</th>
                <th className="px-4 py-2 text-right">勤務時間</th>
                <th className="px-4 py-2 text-right">交通費</th>
                <th className="hidden px-4 py-2 md:table-cell">最終入力</th>
              </tr>
            </thead>
            <tbody>
              {(employees ?? []).map((emp) => {
                const s = byEmployee.get(emp.id);
                const noEntry = !s;
                return (
                  <tr
                    key={emp.id}
                    className={`border-b border-gray-50 ${noEntry ? "bg-amber-50/50" : ""}`}
                  >
                    <td className="px-4 py-3">{emp.employee_no}</td>
                    <td className="px-4 py-3">
                      {emp.name}
                      {!emp.auth_user_id && (
                        <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                          未登録
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {noEntry ? (
                        <span className="text-amber-600">未入力</span>
                      ) : (
                        `${s.days}日`
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s ? formatMinutes(s.minutes) || "0時間" : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s ? `¥${s.transport.toLocaleString()}` : "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                      {s?.lastUpdated
                        ? new Date(s.lastUpdated).toLocaleString("ja-JP", {
                            timeZone: "Asia/Tokyo",
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
              {(employees ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    従業員が登録されていません。
                    <Link
                      href="/admin/employees"
                      className="ml-1 text-blue-600 hover:underline"
                    >
                      従業員管理
                    </Link>
                    から登録してください。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
