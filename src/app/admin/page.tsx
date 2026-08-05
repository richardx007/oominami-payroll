import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { todayJST } from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { loadShiftData } from "@/lib/shift-data";
import { ShiftSchedule } from "./shifts/ShiftSchedule";
import { assignShift, clearShift, setShiftMode } from "./shifts/actions";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  // 管理者も1人の従業員。自分のロックだけオレンジで区別するため id を使う
  const me = await requireAdmin();
  const { p } = await searchParams;

  const supabase = await createClient();

  const shiftData = await loadShiftData(supabase, p);
  const period = shiftData.period;

  const years = Array.from(
    new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])
  );
  const holidays = await fetchJapaneseHolidays(years);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <ShiftSchedule
        period={period}
        slots={shiftData.slots}
        roster={shiftData.roster}
        assignments={shiftData.assignments}
        locks={shiftData.locks}
        statusMap={shiftData.statusMap}
        holidays={holidays}
        today={todayJST()}
        basePath="/admin"
        editable
        meId={me.id}
        assign={assignShift}
        clear={clearShift}
        // setLock は渡さない。ロックを外せるのは本人だけ(管理者は解除できない)。

        mode={shiftData.mode}
        canSwitchMode
        setMode={setShiftMode}
      />
    </div>
  );
}
