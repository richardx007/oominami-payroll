import { describe, expect, it } from "vitest";
import { breakWindowsResolver, slotsResolver, workSettingsAt, type WorkTimeSettingRow } from "./work-time";
import { buildShiftMap } from "./shifts";
import { computePayslip } from "./payroll";

const rows: WorkTimeSettingRow[] = [
  { effective_from: "2000-01-01", key: "shift_slot_b_end", value: "0:00" },
  { effective_from: "2000-01-01", key: "break_window_2_start", value: "19:00" },
  { effective_from: "2000-01-01", key: "break_window_2_end", value: "20:00" },
  { effective_from: "2026-10-01", key: "shift_slot_b_end", value: "23:00" },
  { effective_from: "2026-10-01", key: "break_window_2_start", value: "18:00" },
  { effective_from: "2026-10-01", key: "break_window_2_end", value: "19:00" },
];

describe("workSettingsAt", () => {
  it("キーごとにその日以前で最も新しい適用開始日の値を使う", () => {
    const at = (d: string) => Object.fromEntries(workSettingsAt(rows, d).map((r) => [r.key, r.value]));
    expect(at("2026-09-30").shift_slot_b_end).toBe("0:00");
    expect(at("2026-10-01").shift_slot_b_end).toBe("23:00");
    expect(at("1999-12-31")).toEqual({});
  });
});

describe("slotsResolver", () => {
  it("勤務日ごとに枠の時刻が変わる（未設定の項目は既定値）", () => {
    const slots = slotsResolver(rows);
    expect(slots("2026-09-30").B.end).toBe("0:00");
    expect(slots("2026-10-01").B.end).toBe("23:00");
    expect(slots("2026-10-01").A.start).toBe("8:00");
    const map = buildShiftMap(
      [
        { work_date: "2026-09-30", slot: "B" },
        { work_date: "2026-10-01", slot: "B" },
      ],
      slots
    );
    expect(map["2026-09-30"].end).toBe("0:00");
    expect(map["2026-10-01"].end).toBe("23:00");
  });
});

describe("遅番の終了（翌日まで通しの日）", () => {
  it("通しの日だけ shift_slot_b_end_overnight を使う", () => {
    const r: WorkTimeSettingRow[] = [
      { effective_from: "2026-10-01", key: "shift_slot_b_end", value: "23:00" },
      { effective_from: "2026-10-01", key: "shift_slot_b_end_overnight", value: "0:00" },
    ];
    const slots = slotsResolver(r, ["2026-10-02"]);
    expect(slots("2026-10-01").B.end).toBe("23:00");
    expect(slots("2026-10-02").B.end).toBe("0:00");
    // 他の枠は変わらない
    expect(slots("2026-10-02").A.end).toBe("17:00");
  });

  it("通しの日の終了が未設定なら通常の終了", () => {
    const slots = slotsResolver([{ effective_from: "2000-01-01", key: "shift_slot_b_end", value: "23:00" }], ["2026-10-02"]);
    expect(slots("2026-10-02").B.end).toBe("23:00");
  });
});

describe("breakWindowsResolver", () => {
  it("給与計算は勤務日に有効な休憩時間帯を使う", () => {
    const windows = breakWindowsResolver(rows);
    expect(windows("2026-09-30")[1]).toEqual([19 * 60, 20 * 60]);
    expect(windows("2026-10-01")[1]).toEqual([18 * 60, 19 * 60]);

    // 17:30〜19:30 の勤務: 9/30 は 19-20 の休憩に30分重なる、10/1 は 18-19 の休憩に60分重なる
    const r = computePayslip({
      entries: [
        { work_date: "2026-09-30", start_time: "17:30", end_time: "19:30", break_minutes: 0, transport_cost: 0 },
        { work_date: "2026-10-01", start_time: "17:30", end_time: "19:30", break_minutes: 0, transport_cost: 0 },
      ],
      wageRates: [{ hourly_wage: 1200, effective_from: "2000-01-01" }],
      taxSettings: [],
      lunchRates: [],
      taxRows: [],
      periodEnd: "2026-10-25",
      breakWindows: windows,
    });
    // 90分 + 60分
    expect(r.total_minutes).toBe(150);
  });
});
