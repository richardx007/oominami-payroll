import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { todayJST } from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { loadShiftData } from "@/lib/shift-data";
import { ShiftSchedule } from "@/app/admin/shifts/ShiftSchedule";

export default async function EmployeeShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireEmployee();
  const { p } = await searchParams;

  const supabase = await createClient();
  const shiftData = await loadShiftData(supabase, p);
  const period = shiftData.period;

  const years = Array.from(
    new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])
  );
  const holidays = await fetchJapaneseHolidays(years);

  return (
    <ShiftSchedule
      period={period}
      slots={shiftData.slots}
      roster={shiftData.roster}
      assignments={shiftData.assignments}
      statusMap={shiftData.statusMap}
      holidays={holidays}
      today={todayJST()}
      basePath="/shifts"
    />
  );
}
