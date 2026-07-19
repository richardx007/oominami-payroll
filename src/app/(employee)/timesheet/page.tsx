import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { currentPeriod, periodFromKey, todayJST } from "@/lib/period";
import { fetchJapaneseHolidays } from "@/lib/holidays";
import { buildShiftMap, parseSlots, type SlotKey } from "@/lib/shifts";
import { TimesheetCalendar } from "./ui";
import { upsertWorkEntry, deleteWorkEntry } from "./actions";

export type WorkEntry = {
  work_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number;
  transport_cost: number;
  transport_mode: string | null;
  station_from: string | null;
  station_to: string | null;
  round_trip: boolean;
  note: string | null;
};

export type TransportHistory = {
  stations: string[]; // 過去に入力した駅名の候補
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

  const [
    { data: entries },
    { data: closedPeriod },
    { data: pastEntries },
    { data: shiftRows },
    { data: slotRows },
  ] = await Promise.all([
      supabase
        .from("work_entries")
        .select(
          "work_date, start_time, end_time, break_minutes, transport_cost, transport_mode, station_from, station_to, round_trip, note"
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
      // 過去の交通費入力から駅名候補を集める(直近200件)
      supabase
        .from("work_entries")
        .select("station_from, station_to")
        .eq("employee_id", employee.id)
        .order("work_date", { ascending: false })
        .limit(200),
      // 自分のシフト予定(予実一覧・入力デフォルト用)
      supabase
        .from("shift_assignments")
        .select("work_date, slot, custom_start, custom_end")
        .eq("employee_id", employee.id)
        .gte("work_date", period.start)
        .lte("work_date", period.end),
      // シフト枠の設定(app_settings は直接読めないため関数経由)
      supabase.rpc("get_shift_settings"),
    ]);

  const slots = parseSlots(slotRows as { key: string; value: string }[]);
  const shifts = buildShiftMap(
    (shiftRows ?? []) as {
      work_date: string;
      slot: SlotKey;
      custom_start: string | null;
      custom_end: string | null;
    }[],
    slots
  );

  // time型は "HH:MM:SS" で返るため "HH:MM" に整形
  const normalized = (entries ?? []).map((e) => ({
    ...e,
    start_time: e.start_time.slice(0, 5),
    end_time: e.end_time ? e.end_time.slice(0, 5) : null,
  }));

  const stationSet = new Set<string>();
  for (const e of pastEntries ?? []) {
    if (e.station_from) stationSet.add(e.station_from);
    if (e.station_to) stationSet.add(e.station_to);
  }

  // 期間がまたぐ年の祝日を取得
  const years = Array.from(
    new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])
  );
  const holidays = await fetchJapaneseHolidays(years);

  return (
    <TimesheetCalendar
      period={period}
      entries={normalized as WorkEntry[]}
      closed={!!closedPeriod}
      stations={[...stationSet].sort()}
      holidays={holidays}
      today={todayJST()}
      save={upsertWorkEntry}
      del={deleteWorkEntry}
      employeeName={employee.name}
      shifts={shifts}
    />
  );
}
