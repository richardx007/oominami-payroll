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

  // 調整中の月は自分の希望だけを入力できるようにする。
  // ※カレンダー・日別パネルの表示は確定モードと同じく全員分。他の人と希望が
  //   ぶつかっていることが分かれば当人同士で調整できるため、隠すのは編集操作だけ。
  const draft = shiftData.mode === "draft";

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
      mode={shiftData.mode}
      editable={draft}
      editableEmployeeId={draft ? me.id : null}
      assign={draft ? assignShift : undefined}
      clear={draft ? clearShift : undefined}
    />
  );
}
