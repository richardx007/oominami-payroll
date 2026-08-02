import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { todayJST } from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { loadShiftData } from "@/lib/shift-data";
import { ShiftSchedule } from "@/app/admin/shifts/ShiftSchedule";
import {
  assignShift,
  clearShift,
  setShiftLock,
} from "@/app/admin/shifts/actions";

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
      locks={shiftData.locks}
      statusMap={shiftData.statusMap}
      holidays={holidays}
      today={todayJST()}
      basePath="/shifts"
      mode={shiftData.mode}
      // 確定モードでも自分の行は出す(枠は押せないが「変更不可」の設定/解除はできる)。
      // 管理者はロックを外せない仕様のため、本人がいつでも外せないと解除手段が無くなる。
      editable
      editableEmployeeId={me.id}
      meId={me.id}
      assign={draft ? assignShift : undefined}
      clear={draft ? clearShift : undefined}
      setLock={setShiftLock}
    />
  );
}
