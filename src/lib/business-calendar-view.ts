/**
 * 営業カレンダーの表示用整形（管理画面・HP埋め込み・ポスターで共用）。
 * 移行元 oominami-calendar の normalize.ts / MonthCalendar.tsx の考え方を移植。
 *
 * 入力は business_days / calendar_events / calendar_event_types の行（DB設計は docs/business-calendar-plan.md §5）。
 * 時刻は「その日の0:00からの分」（600=10:00、1440=24:00、1740=翌5:00）。
 */

export type DayType = "weekday" | "fri" | "sat" | "sun" | "holiday" | "pre_holiday";
export type DayStatus = "open" | "closed" | "temp_closed";
export type EventColor = "gold" | "blue" | "purple" | "pink" | "orange" | "gray";

export type BusinessDayRow = {
  date: string; // YYYY-MM-DD
  holiday_name: string | null;
  status: DayStatus;
  open_min: number | null;
  close_min: number | null;
  overnight: boolean;
  is_manual?: boolean;
};

export type EventTypeRow = {
  id: string;
  name: string;
  color: EventColor;
  sort_order: number;
  is_default: boolean;
};

export type CalendarEventRow = {
  id: string;
  start_date: string;
  end_date: string;
  title: string;
  type_id: string | null;
};

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  weekday: "月〜木",
  fri: "金",
  sat: "土",
  sun: "日",
  holiday: "祝",
  pre_holiday: "祝前日",
};

// ---------------------------------------------------------------------------
// 日付キー
// ---------------------------------------------------------------------------

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysKey(key: string, days: number): string {
  const dt = new Date(keyToUtc(key) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** bKey - aKey の日数 */
export function diffDays(aKey: string, bKey: string): number {
  return Math.round((keyToUtc(bKey) - keyToUtc(aKey)) / 86_400_000);
}

/** 0=日 … 6=土 */
export function dayOfWeek(key: string): number {
  return new Date(keyToUtc(key)).getUTCDay();
}

/** 月（"YYYY-MM"）の表示グリッド（日曜始まり・週単位）の日付キー */
export function monthGridKeys(ym: string): string[] {
  const first = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const start = addDaysKey(first, -dayOfWeek(first));
  const end = addDaysKey(last, 6 - dayOfWeek(last));
  const keys: string[] = [];
  for (let k = start; k <= end; k = addDaysKey(k, 1)) keys.push(k);
  return keys;
}

/** 曜日見出し行の背景色を月ごとに 青→黄→緑→桃 で巡回（旧アプリと同じ。公開カレンダーと管理画面で共用） */
const WEEKDAY_HEADER_BG = ["#e6f0fb", "#fbf4dc", "#e8f5ea", "#fceaf0"];

export function weekdayHeaderBg(ym: string): string {
  return WEEKDAY_HEADER_BG[(Number(ym.slice(5, 7)) - 1) % WEEKDAY_HEADER_BG.length];
}

// ---------------------------------------------------------------------------
// 区分の判定
// ※DB側 business_day_type() が同じ規則を持つ。**片方だけ変えないこと。**
// ---------------------------------------------------------------------------

/** 祝前日 → 祝（金・土の祝日は除く） → 曜日 */
export function classifyDayType(key: string, holidays: Record<string, string>): DayType {
  if (holidays[addDaysKey(key, 1)]) return "pre_holiday";
  const dow = dayOfWeek(key);
  if (holidays[key] && dow !== 5 && dow !== 6) return "holiday";
  if (dow === 5) return "fri";
  if (dow === 6) return "sat";
  if (dow === 0) return "sun";
  return "weekday";
}

export type HourPattern = {
  day_type: DayType;
  is_open: boolean;
  open_min: number | null;
  close_min: number | null;
  overnight: boolean;
};

/**
 * 定義から1ヶ月分の日を作る（手修正なしの状態）。
 * ※DB側 generate_business_month() と同じ結果になること。定義画面の結果例・テストに使う。
 */
export function generateMonthRows(
  ym: string,
  holidays: Record<string, string>,
  patterns: HourPattern[]
): BusinessDayRow[] {
  const byType = new Map(patterns.map((p) => [p.day_type, p]));
  const rows: BusinessDayRow[] = [];
  for (let k = `${ym}-01`; k.startsWith(ym); k = addDaysKey(k, 1)) {
    const p = byType.get(classifyDayType(k, holidays));
    const open = !!p?.is_open;
    rows.push({
      date: k,
      holiday_name: holidays[k] ?? null,
      status: open ? "open" : "closed",
      open_min: open ? p!.open_min : null,
      close_min: open && !p!.overnight ? p!.close_min : null,
      overnight: open && p!.overnight,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 時刻表記
// ---------------------------------------------------------------------------

/** 分を時刻表記に。分00は時のみ。24〜29時はそのまま（深夜跨ぎ）、30時以降は「翌H」。 */
export function formatMinutes(min: number): string {
  if (min >= 1440 + 360) return "翌" + formatMinutes(min - 1440);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, "0")}`;
}

/** 通しの末尾で翌日が営業していない場合の閉店表記 */
export const OVERNIGHT_END_LABEL = "翌朝";

// ---------------------------------------------------------------------------
// 整形
// ---------------------------------------------------------------------------

export type DayView = {
  date: string;
  holidayName: string | null;
  status: DayStatus;
  /** 帯に含まれない営業日の時刻チップ（例 "10〜24"） */
  timeLabel: string | null;
  /** 通し営業の帯に含まれる */
  inBand: boolean;
  /** 泊まり可能（その日の夜を通しで営業する） */
  stay: boolean;
  manual: boolean;
  /** この日だけに載るイベント（単日） */
  events: EventView[];
};

export type EventView = {
  id: string;
  title: string;
  typeName: string;
  color: EventColor;
};

/** 複数日にまたがる表示（通し営業の帯・複数日イベント） */
export type Span = {
  id: string;
  kind: "business" | "event";
  startKey: string;
  endKey: string;
  /** business: 初日の開店（例 "10"） */
  startLabel?: string;
  /** business: 最終日の閉店（例 "24" / "翌朝"） */
  endLabel?: string;
  /** event のみ */
  event?: EventView;
};

export type CalendarView = {
  days: Map<string, DayView>;
  spans: Span[];
  legend: { name: string; color: EventColor }[];
};

const FALLBACK_TYPE: EventTypeRow = {
  id: "",
  name: "イベント",
  color: "gold",
  sort_order: 0,
  is_default: true,
};

function sortTypes(types: EventTypeRow[]): EventTypeRow[] {
  return [...types].sort((a, b) => a.sort_order - b.sort_order);
}

function isOpen(d: BusinessDayRow | undefined): d is BusinessDayRow {
  return d?.status === "open";
}

export function buildCalendarView(
  dayRows: BusinessDayRow[],
  eventRows: CalendarEventRow[] = [],
  typeRows: EventTypeRow[] = []
): CalendarView {
  const rows = [...dayRows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const types = sortTypes(typeRows);
  const defaultType = types.find((t) => t.is_default) ?? types[0] ?? FALLBACK_TYPE;
  const typeById = new Map(types.map((t) => [t.id, t]));

  const days = new Map<string, DayView>();
  for (const r of rows) {
    days.set(r.date, {
      date: r.date,
      holidayName: r.holiday_name,
      status: r.status,
      timeLabel: null,
      inBand: false,
      stay: r.status === "open" && r.overnight,
      manual: !!r.is_manual,
      events: [],
    });
  }

  const spans: Span[] = [];

  // 通し営業の連なり: 開始日から、overnight の日が続く限り翌日（営業日）へ伸ばす
  for (const r of rows) {
    if (!isOpen(r)) continue;
    const prev = byDate.get(addDaysKey(r.date, -1));
    if (isOpen(prev) && prev.overnight) continue; // 前日から続いている（開始日ではない）

    let end = r;
    while (end.overnight) {
      const next = byDate.get(addDaysKey(end.date, 1));
      if (!isOpen(next)) break;
      end = next;
    }

    const endLabel = end.overnight
      ? OVERNIGHT_END_LABEL
      : end.close_min != null
        ? formatMinutes(end.close_min)
        : "";
    const startLabel = r.open_min != null ? formatMinutes(r.open_min) : "";

    if (end.date === r.date) {
      days.get(r.date)!.timeLabel = `${startLabel}〜${endLabel}`;
    } else {
      for (let k = r.date; k <= end.date; k = addDaysKey(k, 1)) days.get(k)!.inBand = true;
      spans.push({
        id: `business-${r.date}`,
        kind: "business",
        startKey: r.date,
        endKey: end.date,
        startLabel,
        endLabel,
      });
    }
  }

  // イベント
  for (const e of eventRows) {
    const t = (e.type_id && typeById.get(e.type_id)) || defaultType;
    const ev: EventView = { id: e.id, title: e.title, typeName: t.name, color: t.color };
    if (e.start_date === e.end_date) {
      days.get(e.start_date)?.events.push(ev);
    } else {
      spans.push({ id: `event-${e.id}`, kind: "event", startKey: e.start_date, endKey: e.end_date, event: ev });
    }
  }

  const legend = (types.length ? types : [FALLBACK_TYPE]).map((t) => ({ name: t.name, color: t.color }));
  return { days, spans, legend };
}

// ---------------------------------------------------------------------------
// 週ごとの帯の割り付け
// ---------------------------------------------------------------------------

export type WeekSeg = {
  id: string;
  kind: Span["kind"];
  col: number; // 0..6
  span: number;
  level: number;
  continuesLeft: boolean;
  continuesRight: boolean;
  /** business: 先頭「初日10〜通し」（週をまたいで続く側では空） */
  head: string;
  /** business: 末尾「〜最終24」（週をまたいで続く側では空） */
  tail: string;
  event?: EventView;
};

/** 1週間（日〜土）ぶんの帯セグメントを算出し、重なりを段に割り付ける。営業の帯が上段。 */
export function layoutWeek(
  weekStartKey: string,
  spans: Span[]
): { segs: WeekSeg[]; levels: number } {
  const weekEndKey = addDaysKey(weekStartKey, 6);
  const segs: WeekSeg[] = spans
    .filter((s) => !(s.endKey < weekStartKey || s.startKey > weekEndKey))
    .map((s) => {
      const segStart = s.startKey > weekStartKey ? s.startKey : weekStartKey;
      const segEnd = s.endKey < weekEndKey ? s.endKey : weekEndKey;
      const continuesLeft = s.startKey < weekStartKey;
      const continuesRight = s.endKey > weekEndKey;
      const business = s.kind === "business";
      return {
        id: s.id,
        kind: s.kind,
        col: diffDays(weekStartKey, segStart),
        span: diffDays(segStart, segEnd) + 1,
        level: 0,
        continuesLeft,
        continuesRight,
        head: business && !continuesLeft ? `初日${s.startLabel}〜通し` : "",
        tail: business && !continuesRight ? `〜最終${s.endLabel}` : "",
        event: s.event,
      };
    })
    .sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "business" ? -1 : 1) || a.col - b.col || b.span - a.span
    );

  const levelEnd: number[] = [];
  for (const seg of segs) {
    let lv = 0;
    while (levelEnd[lv] !== undefined && levelEnd[lv] > seg.col) lv++;
    seg.level = lv;
    levelEnd[lv] = seg.col + seg.span;
  }
  const levels = segs.reduce((m, s) => Math.max(m, s.level + 1), 0);
  return { segs, levels };
}

// ---------------------------------------------------------------------------
// 入力（管理画面）
// ---------------------------------------------------------------------------

/** "10:00" / "10" / "26:30" → 分。不正は null。0:00〜47:59 を許容（閉店は翌日の時刻も書ける）。 */
export function parseTimeInput(s: string): number | null {
  const m = s.trim().replace("：", ":").match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 47 || min > 59) return null;
  return h * 60 + min;
}

/** 分 → "10:00" / "24:00" / "26:30"（入力欄の初期値） */
export function minutesToInput(min: number | null): string {
  if (min == null) return "";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 月の状態（日付から自動で決まる）
// ---------------------------------------------------------------------------

export type MonthState = "none" | "draft" | "public";

export const MONTH_STATE_LABELS: Record<MonthState, string> = {
  none: "未作成",
  draft: "準備中",
  public: "公開中",
};

/** "YYYY-MM" に月数を足す */
export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** 過去・今月・翌月＝公開中、翌々月以降＝準備中。作成前は未作成（過去の月も後から作成できる）。 */
export function monthState(ym: string, todayKey: string, generated: boolean): MonthState {
  const cur = todayKey.slice(0, 7);
  if (!generated) return "none";
  return ym <= addMonthsYm(cur, 1) ? "public" : "draft";
}

/** 準備中の月がHPに出る日（前月1日＝「翌月」になる日）と、その前日＝締切・残り日数 */
export function draftDeadline(
  ym: string,
  todayKey: string
): { publishFrom: string; deadline: string; daysLeft: number } {
  const publishFrom = `${addMonthsYm(ym, -1)}-01`;
  const deadline = addDaysKey(publishFrom, -1);
  return { publishFrom, deadline, daysLeft: diffDays(todayKey, deadline) };
}

/** JST の今日 "YYYY-MM-DD" */
export function jstTodayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ---------------------------------------------------------------------------
// イベントの色（HP埋め込み・ポスターでも使うため Tailwind クラスではなく色値で持つ）
// 緑＝営業時間、赤＝臨時休業と紛らわしいため含めない
// ---------------------------------------------------------------------------

export const EVENT_COLORS: Record<EventColor, { label: string; line: string; text: string; soft: string }> = {
  gold: { label: "金", line: "#d3a94e", text: "#b8860b", soft: "#fbf1d9" }, // 旧アプリのイベント色と同じ
  blue: { label: "青", line: "#3b82f6", text: "#1d4ed8", soft: "#e8f0fe" },
  purple: { label: "紫", line: "#8b5cf6", text: "#6d28d9", soft: "#f1ebfd" },
  pink: { label: "ピンク", line: "#ec4899", text: "#be185d", soft: "#fdebf3" },
  orange: { label: "オレンジ", line: "#f97316", text: "#c2410c", soft: "#fff0e6" },
  gray: { label: "グレー", line: "#9ca3af", text: "#4b5563", soft: "#f1f2f4" },
};

export const EVENT_COLOR_KEYS = Object.keys(EVENT_COLORS) as EventColor[];
