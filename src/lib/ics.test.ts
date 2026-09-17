import { describe, expect, it } from "vitest";
import { buildShiftIcs, escapeText, foldLine, type CalendarFeedData } from "./ics";

const base: CalendarFeedData = {
  employee_id: "e1",
  company_name: "大波",
  slots: [],
  shifts: [],
};

describe("buildShiftIcs", () => {
  it("確定シフトは枠名そのまま・時刻はUTC・STATUS:CONFIRMED", () => {
    const ics = buildShiftIcs({
      ...base,
      shifts: [
        { work_date: "2026-09-20", slot: "A", custom_start: null, custom_end: null, draft: false },
      ],
    });
    expect(ics).toContain("X-WR-CALNAME:大波 シフト");
    expect(ics).toContain("SUMMARY:早番\r\n");
    // 8:00-17:00 JST = 前日23:00Z-08:00Z
    expect(ics).toContain("DTSTART:20260919T230000Z");
    expect(ics).toContain("DTEND:20260920T080000Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("UID:shift-2026-09-20-e1@oominami-payroll");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("調整中は「仮:」付き・STATUS:TENTATIVE", () => {
    const ics = buildShiftIcs({
      ...base,
      shifts: [
        { work_date: "2026-10-01", slot: "B", custom_start: null, custom_end: null, draft: true },
      ],
    });
    expect(ics).toContain("SUMMARY:仮:遅番");
    expect(ics).toContain("STATUS:TENTATIVE");
  });

  it("深夜番(0:00始まり)は翌日扱い、変則時刻は枠の既定を上書き", () => {
    const ics = buildShiftIcs({
      ...base,
      shifts: [
        { work_date: "2026-09-20", slot: "C", custom_start: null, custom_end: null, draft: false },
        { work_date: "2026-09-22", slot: "A", custom_start: "11:00", custom_end: null, draft: false },
      ],
    });
    // 9/20の深夜番 = 9/21 0:00-9:00 JST = 9/20 15:00Z - 9/21 00:00Z
    expect(ics).toContain("DTSTART:20260920T150000Z");
    expect(ics).toContain("DTEND:20260921T000000Z");
    // 11:00-17:00 JST
    expect(ics).toContain("DTSTART:20260922T020000Z");
  });

  it("会社名未設定でもカレンダー名が付く", () => {
    expect(buildShiftIcs({ ...base, company_name: null })).toContain("X-WR-CALNAME:シフト");
  });
});

describe("escapeText / foldLine", () => {
  it("特殊文字をエスケープする", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("75バイトごとに折り返し、マルチバイト文字を分断しない", () => {
    const line = "DESCRIPTION:" + "あ".repeat(40);
    const folded = foldLine(line);
    const enc = new TextEncoder();
    for (const part of folded.split("\r\n")) {
      expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});
