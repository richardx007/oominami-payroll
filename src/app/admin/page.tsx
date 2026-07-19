import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod, periodFromKey, todayJST } from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { loadShiftData } from "@/lib/shift-data";
import { ShiftSchedule } from "./shifts/ShiftSchedule";
import { assignShift, clearShift } from "./shifts/actions";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireAdmin();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();

  const shiftData = await loadShiftData(supabase, period);

  const years = Array.from(
    new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])
  );
  const holidays = await fetchJapaneseHolidays(years);

  return (
    <div className="space-y-4">
      <ShiftSchedule
        period={period}
        slots={shiftData.slots}
        roster={shiftData.roster}
        assignments={shiftData.assignments}
        statusMap={shiftData.statusMap}
        holidays={holidays}
        today={todayJST()}
        basePath="/admin"
        editable
        assign={assignShift}
        clear={clearShift}
      />
    </div>
  );
}
