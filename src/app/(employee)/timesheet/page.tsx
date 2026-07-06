import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { currentPeriod, periodFromKey } from "@/lib/period";
import { TimesheetCalendar } from "./ui";

export type WorkEntry = {
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  transport_cost: number;
  note: string | null;
};

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const employee = await requireEmployee();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();

  const [{ data: entries }, { data: closedPeriod }] = await Promise.all([
    supabase
      .from("work_entries")
      .select(
        "work_date, start_time, end_time, break_minutes, transport_cost, note"
      )
      .eq("employee_id", employee.id)
      .gte("work_date", period.start)
      .lte("work_date", period.end)
      .order("work_date"),
    supabase
      .from("pay_periods")
      .select("status")
      .eq("start_date", period.start)
      .eq("end_date", period.end)
      .neq("status", "open")
      .maybeSingle(),
  ]);

  // time型は "HH:MM:SS" で返るため "HH:MM" に整形
  const normalized = (entries ?? []).map((e) => ({
    ...e,
    start_time: e.start_time.slice(0, 5),
    end_time: e.end_time.slice(0, 5),
  }));

  return (
    <TimesheetCalendar
      period={period}
      entries={normalized as WorkEntry[]}
      closed={!!closedPeriod}
    />
  );
}
