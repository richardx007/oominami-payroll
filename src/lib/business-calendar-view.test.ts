import { describe, expect, it } from "vitest";
import {
  buildCalendarView,
  classifyDayType,
  formatMinutes,
  generateMonthRows,
  layoutWeek,
  minutesToInput,
  monthGridKeys,
  monthState,
  draftDeadline,
  jstTodayKey,
  parseTimeInput,
  patternForDate,
  footnoteOf,
  regenerateTargetMonths,
  type BusinessDayRow,
  type HourPattern,
} from "./business-calendar-view";

// DBの初期定義（supabase/migrations/20260917100000_business_calendar.sql）と同じ
const PATTERNS: HourPattern[] = [
  { day_type: "weekday", is_open: true, open_min: 600, close_min: 1440, overnight: false },
  { day_type: "fri", is_open: true, open_min: 600, close_min: null, overnight: true },
  { day_type: "sat", is_open: true, open_min: 600, close_min: null, overnight: true },
  { day_type: "sun", is_open: true, open_min: 600, close_min: 1440, overnight: false },
  { day_type: "holiday", is_open: true, open_min: 600, close_min: 1440, overnight: false },
  { day_type: "pre_holiday", is_open: true, open_min: 600, close_min: null, overnight: true },
];

const HOLIDAYS: Record<string, string> = {
  "2026-09-21": "敬老の日",
  "2026-09-22": "休日",
  "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日",
  "2026-11-03": "文化の日",
  "2026-11-23": "勤労感謝の日",
  "2027-01-01": "元日",
  "2028-02-11": "建国記念の日",
};

function spansOf(rows: BusinessDayRow[]) {
  return buildCalendarView(rows).spans.map((s) => [s.startKey, s.endKey, s.startLabel, s.endLabel]);
}

describe("区分の判定", () => {
  it("2026年9月の連休: 翌日が祝日なら祝前日、最後の祝日は祝", () => {
    expect(classifyDayType("2026-09-19", HOLIDAYS)).toBe("sat");
    expect(classifyDayType("2026-09-20", HOLIDAYS)).toBe("pre_holiday"); // 日
    expect(classifyDayType("2026-09-21", HOLIDAYS)).toBe("pre_holiday"); // 月・祝
    expect(classifyDayType("2026-09-22", HOLIDAYS)).toBe("pre_holiday"); // 火・祝
    expect(classifyDayType("2026-09-23", HOLIDAYS)).toBe("holiday"); // 水・祝
    expect(classifyDayType("2026-09-24", HOLIDAYS)).toBe("weekday");
  });

  it("金・土の祝日は金・土の区分（2028/2/11 金・建国記念の日）", () => {
    expect(classifyDayType("2028-02-10", HOLIDAYS)).toBe("pre_holiday");
    expect(classifyDayType("2028-02-11", HOLIDAYS)).toBe("fri");
    expect(classifyDayType("2028-02-12", HOLIDAYS)).toBe("sat");
    expect(classifyDayType("2028-02-13", HOLIDAYS)).toBe("sun");
  });

  it("月末の翌日が祝日なら祝前日（年をまたぐ）", () => {
    expect(classifyDayType("2026-12-31", HOLIDAYS)).toBe("pre_holiday");
  });
});

describe("時刻表記", () => {
  it("分00は時のみ、24〜29時はそのまま、30時以降は翌", () => {
    expect(formatMinutes(600)).toBe("10");
    expect(formatMinutes(630)).toBe("10:30");
    expect(formatMinutes(1440)).toBe("24");
    expect(formatMinutes(1740)).toBe("29");
    expect(formatMinutes(1800)).toBe("翌6");
  });
});

describe("2026年9月（HP画像との照合）", () => {
  const rows = generateMonthRows("2026-09", HOLIDAYS, PATTERNS);
  const view = buildCalendarView(rows);

  it("平日は単日の 10〜24", () => {
    expect(view.days.get("2026-09-01")!.timeLabel).toBe("10〜24"); // 火
    expect(view.days.get("2026-09-24")!.timeLabel).toBe("10〜24"); // 木
  });

  it("週末は金10〜通し → 日〜24 の帯、連休は 9/18〜9/23 の1本", () => {
    expect(spansOf(rows)).toEqual([
      ["2026-09-04", "2026-09-06", "10", "24"],
      ["2026-09-11", "2026-09-13", "10", "24"],
      ["2026-09-18", "2026-09-23", "10", "24"],
      ["2026-09-25", "2026-09-27", "10", "24"],
    ]);
    expect(view.days.get("2026-09-23")!.inBand).toBe(true);
    expect(view.days.get("2026-09-23")!.timeLabel).toBeNull();
  });

  it("泊まり可は通しの夜（最終日には付かない）", () => {
    const stay = [...view.days.values()].filter((d) => d.stay).map((d) => d.date.slice(8));
    expect(stay).toEqual(["04", "05", "11", "12", "18", "19", "20", "21", "22", "25", "26"]);
  });

  it("祝日名は保持される（赤字判定用）", () => {
    expect(view.days.get("2026-09-21")!.holidayName).toBe("敬老の日");
  });
});

describe("帯の途切れ・端", () => {
  const base = generateMonthRows("2026-09", HOLIDAYS, PATTERNS);
  const edit = (date: string, patch: Partial<BusinessDayRow>) =>
    base.map((r) => (r.date === date ? { ...r, ...patch, is_manual: true } : r));

  it("臨時休業の日で帯が途切れ、前日は翌朝まで", () => {
    const rows = edit("2026-09-20", { status: "temp_closed", open_min: null, overnight: false });
    const view = buildCalendarView(rows);
    expect(spansOf(rows)).toContainEqual(["2026-09-18", "2026-09-19", "10", "翌朝"]);
    expect(spansOf(rows)).toContainEqual(["2026-09-21", "2026-09-23", "10", "24"]);
    expect(view.days.get("2026-09-20")!.status).toBe("temp_closed");
    expect(view.days.get("2026-09-20")!.manual).toBe(true);
  });

  it("通しをやめた金曜は単日チップ", () => {
    const rows = edit("2026-09-04", { overnight: false, close_min: 1500 });
    const view = buildCalendarView(rows);
    expect(view.days.get("2026-09-04")!.timeLabel).toBe("10〜25");
    // 土は前日から続かないので自分の開店時刻から始まる
    expect(spansOf(rows)).toContainEqual(["2026-09-05", "2026-09-06", "10", "24"]);
  });

  it("前月末の通しから始まる月は、前月の行を渡すと月をまたいだ1本になる", () => {
    const rows = [
      ...generateMonthRows("2026-10", HOLIDAYS, PATTERNS),
      ...generateMonthRows("2026-11", HOLIDAYS, PATTERNS),
    ];
    // 10/30(金)〜11/1(日)
    expect(spansOf(rows)).toContainEqual(["2026-10-30", "2026-11-01", "10", "24"]);
    // 11/2(月)は祝前日で通し → 11/3(火・祝) 〜24
    expect(spansOf(rows)).toContainEqual(["2026-11-02", "2026-11-03", "10", "24"]);
  });
});

describe("週の割り付け", () => {
  const rows = generateMonthRows("2026-09", HOLIDAYS, PATTERNS);
  const { spans } = buildCalendarView(rows);

  it("週またぎの帯は分割され、先頭・末尾の表記は端の週だけ", () => {
    // 9/13(日)始まりの週: 9/18(金)〜9/19(土)、続きは次週
    const w1 = layoutWeek("2026-09-13", spans);
    const seg1 = w1.segs.find((s) => s.id === "business-2026-09-18")!;
    expect(seg1).toMatchObject({ col: 5, span: 2, continuesRight: true, head: "初日10〜通し", tail: "" });
    // 9/13 は前週からの帯の最終日
    expect(w1.segs.find((s) => s.id === "business-2026-09-11")).toMatchObject({
      col: 0,
      span: 1,
      continuesLeft: true,
      head: "",
      tail: "〜最終24",
    });

    const w2 = layoutWeek("2026-09-20", spans);
    expect(w2.segs.find((s) => s.id === "business-2026-09-18")).toMatchObject({
      col: 0,
      span: 4,
      continuesLeft: true,
      head: "",
      tail: "〜最終24",
    });
  });

  it("複数日イベントは営業の帯の下の段、色は種類から（種類なしは既定）", () => {
    const view = buildCalendarView(
      rows,
      [
        { id: "a", start_date: "2026-09-19", end_date: "2026-09-21", title: "夏祭り", type_id: null },
        { id: "b", start_date: "2026-09-24", end_date: "2026-09-24", title: "貸切", type_id: "t2" },
      ],
      [
        { id: "t2", name: "お知らせ", color: "blue", sort_order: 2, is_default: false },
        { id: "t1", name: "イベント", color: "gold", sort_order: 1, is_default: true },
      ]
    );
    const w = layoutWeek("2026-09-13", view.spans);
    expect(w.levels).toBe(2);
    expect(w.segs.find((s) => s.id === "event-a")).toMatchObject({ level: 1, col: 6, span: 1 });
    expect(w.segs.find((s) => s.id === "event-a")!.event!.color).toBe("gold");
    expect(view.days.get("2026-09-24")!.events).toEqual([
      { id: "b", title: "貸切", typeName: "お知らせ", color: "blue" },
    ]);
    expect(view.legend).toEqual([
      { name: "イベント", color: "gold" },
      { name: "お知らせ", color: "blue" },
    ]);
  });
});

describe("月グリッド", () => {
  it("日曜始まりで週単位に揃う", () => {
    const keys = monthGridKeys("2026-09");
    expect(keys[0]).toBe("2026-08-30");
    expect(keys.at(-1)).toBe("2026-10-03");
    expect(keys.length % 7).toBe(0);
  });
});

describe("入力と月の状態", () => {
  it("時刻入力", () => {
    expect(parseTimeInput("10:00")).toBe(600);
    expect(parseTimeInput("10")).toBe(600);
    expect(parseTimeInput("26:30")).toBe(1590);
    expect(parseTimeInput("10:60")).toBeNull();
    expect(parseTimeInput("abc")).toBeNull();
    expect(minutesToInput(1590)).toBe("26:30");
  });

  it("過去・今月・翌月は公開中、翌々月は準備中、作成前は過去でも未作成", () => {
    const today = "2026-09-17";
    expect(monthState("2026-08", today, true)).toBe("public");
    expect(monthState("2026-08", today, false)).toBe("none");
    expect(monthState("2026-09", today, true)).toBe("public");
    expect(monthState("2026-10", today, true)).toBe("public");
    expect(monthState("2026-11", today, true)).toBe("draft");
    expect(monthState("2026-11", today, false)).toBe("none");
    expect(monthState("2027-01", "2026-12-01", true)).toBe("public");
  });

  it("11月分は10月1日に公開、締切は9月30日", () => {
    expect(draftDeadline("2026-11", "2026-09-17")).toEqual({
      publishFrom: "2026-10-01",
      deadline: "2026-09-30",
      daysLeft: 13,
    });
  });

  it("JSTの今日", () => {
    expect(jstTodayKey(new Date("2026-09-30T15:30:00Z"))).toBe("2026-10-01");
  });
});

describe("適用開始日", () => {
  // 10/1 から平日だけ 11〜23 に変わる例
  const OCT: HourPattern[] = PATTERNS.map((p) =>
    p.day_type === "weekday"
      ? { ...p, open_min: 660, close_min: 1380, effective_from: "2026-10-01" }
      : { ...p, effective_from: "2026-10-01" }
  );
  const ALL = [...PATTERNS, ...OCT];

  it("その日以前で最も新しい適用開始日の定義を使う", () => {
    expect(patternForDate(ALL, "weekday", "2026-09-30")!.open_min).toBe(600);
    expect(patternForDate(ALL, "weekday", "2026-10-01")!.open_min).toBe(660);
    expect(patternForDate(ALL, "weekday", "2027-01-05")!.open_min).toBe(660);
  });

  it("適用開始日より前しか無い日は定義なし", () => {
    expect(patternForDate(OCT, "weekday", "2026-09-30")).toBeUndefined();
  });

  it("月の途中から切り替わる（9月末は旧定義、10月は新定義）", () => {
    const sep = generateMonthRows("2026-09", HOLIDAYS, ALL);
    expect(sep.find((r) => r.date === "2026-09-30")).toMatchObject({ open_min: 600, close_min: 1440 });
    const oct = generateMonthRows("2026-10", HOLIDAYS, ALL);
    expect(oct.find((r) => r.date === "2026-10-01")).toMatchObject({ open_min: 660, close_min: 1380 }); // 木
    expect(oct.find((r) => r.date === "2026-10-02")).toMatchObject({ open_min: 600, overnight: true }); // 金
  });
});

describe("定義の変更で作り直す月", () => {
  const created = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  it("最初の定義の修正は準備中の月だけ", () => {
    expect(regenerateTargetMonths(created, "2000-01-01", "2026-09-23")).toEqual(["2026-11"]);
  });
  it("これからの変更（10/1〜）は適用開始日の月から、公開中の月も含む", () => {
    expect(regenerateTargetMonths(created, "2026-10-01", "2026-09-23")).toEqual(["2026-10", "2026-11"]);
    expect(regenerateTargetMonths(created, "2026-09-25", "2026-09-23")).toEqual(["2026-09", "2026-10", "2026-11"]);
  });
  it("適用開始日を過ぎた定義の修正は準備中の月だけ", () => {
    expect(regenerateTargetMonths(created, "2026-09-01", "2026-09-23")).toEqual(["2026-11"]);
  });
});

describe("月の注釈", () => {
  const notes = [
    { ym: "2026-10", footnote: "10月より平日は23時まで" },
    { ym: "2026-11", footnote: "  " },
  ];
  it("その月の注釈を返し、空なら null", () => {
    expect(footnoteOf(notes, "2026-10")).toBe("10月より平日は23時まで");
    expect(footnoteOf(notes, "2026-11")).toBeNull();
    expect(footnoteOf(notes, "2026-12")).toBeNull();
    expect(footnoteOf(undefined, "2026-10")).toBeNull();
  });
});
