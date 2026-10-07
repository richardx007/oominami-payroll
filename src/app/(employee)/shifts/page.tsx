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
  setShiftMode,
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
  // リーダはメンバー間のシフト調整を行うため、月のモードに関わらず全員の予定を変更でき、
  // 調整中⇔確定も切り替えられる(確定月に他人の予定を変えると本人に通知される)。
  const draft = shiftData.mode === "draft";
  const leader = me.is_leader;
  const canAssign = draft || leader;

  return (
    <ShiftSchedule
      period={period}
      slotVersions={shiftData.slotVersions}
      overnightDates={shiftData.overnightDates}
      roster={shiftData.roster}
      assignments={shiftData.assignments}
      locks={shiftData.locks}
      statusMap={shiftData.statusMap}
      timesMap={shiftData.timesMap}
      holidays={holidays}
      today={todayJST()}
      basePath="/shifts"
      // 日別パネルで自分の行にだけ「勤務表」アイコンを出す(他人の勤務実績は見られないため)。
      // タップで自分の勤務表(その日を選択済み)へ飛べる。
      timesheetBasePath="/timesheet"
      timesheetSelfOnly
      mode={shiftData.mode}
      // 確定モードでも自分の行は出す(枠は押せないが「変更不可」の設定/解除はできる)。
      // 管理者はロックを外せない仕様のため、本人がいつでも外せないと解除手段が無くなる。
      editable
      editableEmployeeId={leader ? null : me.id}
      meId={me.id}
      // 日別パネル(シフト編集)で自分の行を常に先頭に出す
      selfFirst
      assign={canAssign ? assignShift : undefined}
      clear={canAssign ? clearShift : undefined}
      // ロックを切り替えられるのは本人の行だけ(リーダも他人のロックは外せない)
      setLock={setShiftLock}
      canSwitchMode={leader}
      setMode={leader ? setShiftMode : undefined}
      notifyOnConfirmedEdit={leader}
    />
  );
}
