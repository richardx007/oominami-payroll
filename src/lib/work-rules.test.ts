import { describe, expect, it } from "vitest";
import { DEFAULT_BREAK_WINDOWS } from "./breaks";
import { DEFAULT_SLOTS } from "./shifts";
import { buildShiftRules, durationLabel } from "./work-rules";

describe("buildShiftRules", () => {
  it("既定の3枠は勤務ルール資料と同じ内容になる", () => {
    const [a, b, c] = buildShiftRules(DEFAULT_SLOTS, DEFAULT_BREAK_WINDOWS);
    expect(a.work).toEqual({ start: "8:00", end: "17:00" });
    expect(a.breaks).toEqual([{ start: "12:00", end: "13:00" }]);
    expect(a.night).toEqual([]);
    expect(a.nightMinutes).toBe(0);

    expect(b.work).toEqual({ start: "15:00", end: "0:00" });
    expect(b.breaks).toEqual([{ start: "19:00", end: "20:00" }]);
    expect(b.night).toEqual([{ start: "22:00", end: "0:00" }]);
    expect(b.nightMinutes).toBe(120);

    expect(c.work).toEqual({ start: "0:00", end: "9:00" });
    expect(c.breaks).toEqual([{ start: "4:00", end: "5:00" }]);
    expect(c.night).toEqual([{ start: "0:00", end: "5:00" }]);
    expect(c.nightMinutes).toBe(240);
  });

  it("勤務時間が変わると休憩・深夜も追従する", () => {
    const slots = { ...DEFAULT_SLOTS, B: { ...DEFAULT_SLOTS.B, start: "14:00", end: "23:00" } };
    const b = buildShiftRules(slots, DEFAULT_BREAK_WINDOWS)[1];
    expect(b.breaks).toEqual([{ start: "19:00", end: "20:00" }]);
    expect(b.night).toEqual([{ start: "22:00", end: "23:00" }]);
    expect(b.nightMinutes).toBe(60);
  });

  it("休憩帯が複数重なる番は全て出す", () => {
    const slots = { ...DEFAULT_SLOTS, A: { ...DEFAULT_SLOTS.A, start: "10:00", end: "22:00" } };
    const a = buildShiftRules(slots, DEFAULT_BREAK_WINDOWS)[0];
    expect(a.breaks).toEqual([
      { start: "12:00", end: "13:00" },
      { start: "19:00", end: "20:00" },
    ]);
    expect(a.breakMinutes).toBe(120);
  });
});

describe("durationLabel", () => {
  it("時間・分の表記", () => {
    expect(durationLabel(120)).toBe("2時間");
    expect(durationLabel(90)).toBe("1時間30分");
    expect(durationLabel(30)).toBe("30分");
  });
});
