import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod, periodFromKey } from "@/lib/period";
import { HoursView, type EmployeeHours, type HoursEntry } from "./ui";

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireAdmin();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();

  const [{ data: employees }, { data: entries }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_no, name")
      .eq("status", "active")
      .eq("is_admin", false)
      .order("employee_no"),
    supabase
      .from("work_entries")
      .select(
        "employee_id, work_date, start_time, end_time, break_minutes, transport_cost, transport_mode, station_from, station_to, round_trip"
      )
      .gte("work_date", period.start)
      .lte("work_date", period.end)
      .order("work_date"),
  ]);

  const entriesByEmp = new Map<string, HoursEntry[]>();
  for (const e of entries ?? []) {
    const arr = entriesByEmp.get(e.employee_id) ?? [];
    arr.push({
      work_date: e.work_date,
      start_time: e.start_time.slice(0, 5),
      end_time: e.end_time.slice(0, 5),
      break_minutes: e.break_minutes,
      transport_cost: e.transport_cost,
      transport_mode: e.transport_mode,
      station_from: e.station_from,
      station_to: e.station_to,
      round_trip: e.round_trip,
    });
    entriesByEmp.set(e.employee_id, arr);
  }

  // 当該期間に1日以上勤務した従業員のみを左リストに表示
  const workers: EmployeeHours[] = (employees ?? [])
    .filter((emp) => (entriesByEmp.get(emp.id) ?? []).length > 0)
    .map((emp) => ({
      id: emp.id,
      employee_no: emp.employee_no,
      name: emp.name,
      entries: entriesByEmp.get(emp.id) ?? [],
    }));

  return <HoursView periodKey={period.key} workers={workers} />;
}
