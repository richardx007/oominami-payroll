/**
 * ホームページのトップに埋め込む「本日の営業」の文言（/calendar/embed/today）。
 * 営業カレンダーの前日・当日の行と公開イベントから組み立てる。
 * - 開始: 前日が通し営業（overnight）で当日も営業なら「昨晩からの通し」、それ以外は開店時刻
 * - 終了: 当日が通し営業なら「通し営業」、それ以外は閉店時刻
 * - 日付は JST の暦日（深夜0時に翌日の表示に変わる）
 */
import {
  addDaysKey,
  dayOfWeek,
  type BusinessDayRow,
  type CalendarEventRow,
} from "./business-calendar-view";

export const OVERNIGHT_FROM_LABEL = "昨晩からの通し";
export const OVERNIGHT_TO_LABEL = "通し営業";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export type TodayBusiness = {
  /** "10月12日（月・スポーツの日）" */
  dateLabel: string;
  /** 土日祝（赤字で出す） */
  red: boolean;
  /** "unknown" はまだ営業カレンダーを作っていない日 */
  status: BusinessDayRow["status"] | "unknown";
  /** 営業日のみ。"10:00" または「昨晩からの通し」 */
  start: string | null;
  /** 営業日のみ。"24:00" または「通し営業」 */
  end: string | null;
  /** その日に掛かる公開イベントの名前（複数日のイベントも含む） */
  events: string[];
};

/** 分 → "10:00"。24時以降は "25:30" のように数える（翌朝6時以降は「翌6:00」） */
export function clockLabel(min: number): string {
  if (min >= 1440 + 360) return "翌" + clockLabel(min - 1440);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function buildTodayBusiness(
  days: Pick<BusinessDayRow, "date" | "holiday_name" | "status" | "open_min" | "close_min" | "overnight">[],
  events: Pick<CalendarEventRow, "start_date" | "end_date" | "title">[],
  todayKey: string
): TodayBusiness {
  const today = days.find((d) => d.date === todayKey);
  const prev = days.find((d) => d.date === addDaysKey(todayKey, -1));
  const dow = dayOfWeek(todayKey);
  const holiday = today?.holiday_name ?? null;
  const dateLabel = `${Number(todayKey.slice(5, 7))}月${Number(todayKey.slice(8, 10))}日（${WEEKDAYS[dow]}${
    holiday ? `・${holiday}` : ""
  }）`;

  let start: string | null = null;
  let end: string | null = null;
  if (today?.status === "open") {
    start =
      prev?.status === "open" && prev.overnight
        ? OVERNIGHT_FROM_LABEL
        : today.open_min != null
          ? clockLabel(today.open_min)
          : null;
    end = today.overnight
      ? OVERNIGHT_TO_LABEL
      : today.close_min != null
        ? clockLabel(today.close_min)
        : null;
  }

  return {
    dateLabel,
    red: dow === 0 || dow === 6 || !!holiday,
    status: today?.status ?? "unknown",
    start,
    end,
    events: events
      .filter((e) => e.start_date <= todayKey && e.end_date >= todayKey)
      .map((e) => e.title),
  };
}

/** 営業時間・休業の1行（"10:00〜24:00" / "臨時休業" など） */
export function todayHoursText(t: TodayBusiness): string {
  if (t.status === "open") return `${t.start ?? ""}〜${t.end ?? ""}`;
  if (t.status === "temp_closed") return "臨時休業";
  if (t.status === "closed") return "休業日";
  return "準備中";
}
