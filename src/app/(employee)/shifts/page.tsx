import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { todayJST } from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { loadShiftData } from "@/lib/shift-data";
import { ShiftSchedule } from "@/app/admin/shifts/ShiftSchedule";
import { assignShift, clearShift } from "@/app/admin/shifts/actions";

export default async function EmployeeShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const me = await requireEmployee();
  const { p } = await searchParams;

  const supabase = await createClient();
  const shiftData = await loadShiftData(supabase, p);
  const period = shiftData.period;

  const years = Array.from(
    new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])
  );
  const holidays = await fetchJapaneseHolidays(years);

  // 調整中の月は自分の希望だけを入力する画面にする。名簿も自分だけに絞り、
  // 他の人の名前が並ばないようにする(他人の希望はRLSでそもそも取得されない)。
  const draft = shiftData.mode === "draft";
  const roster = draft
    ? shiftData.roster.filter((m) => m.id === me.id)
    : shiftData.roster;

  return (
    <ShiftSchedule
      period={period}
      slots={shiftData.slots}
      roster={roster}
      assignments={shiftData.assignments}
      statusMap={shiftData.statusMap}
      holidays={holidays}
      today={todayJST()}
      basePath="/shifts"
      mode={shiftData.mode}
      editable={draft}
      selfOnly={draft}
      assign={draft ? assignShift : undefined}
      clear={draft ? clearShift : undefined}
    />
  );
}
