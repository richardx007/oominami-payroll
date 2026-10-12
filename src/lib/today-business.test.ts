import { describe, expect, it } from "vitest";
import { buildTodayBusiness, clockLabel, todayHoursText } from "./today-business";

const day = (date: string, o: Partial<{ status: "open" | "closed" | "temp_closed"; open_min: number | null; close_min: number | null; overnight: boolean; holiday_name: string | null }> = {}) => ({
  date,
  holiday_name: null,
  status: "open" as const,
  open_min: 600,
  close_min: 1440,
  overnight: false,
  ...o,
});

describe("clockLabel", () => {
  it("24時以降も数える・翌朝6時以降は翌", () => {
    expect(clockLabel(600)).toBe("10:00");
    expect(clockLabel(1440)).toBe("24:00");
    expect(clockLabel(1530)).toBe("25:30");
    expect(clockLabel(1800)).toBe("翌6:00");
  });
});

describe("buildTodayBusiness", () => {
  it("通常の営業日", () => {
    const t = buildTodayBusiness([day("2026-10-12", { holiday_name: "スポーツの日" })], [], "2026-10-12");
    expect(t.dateLabel).toBe("10月12日（月・スポーツの日）");
    expect(t.red).toBe(true);
    expect(todayHoursText(t)).toBe("10:00〜24:00");
    expect(t.events).toEqual([]);
  });

  it("前日から通し・当日も通し", () => {
    const t = buildTodayBusiness(
      [day("2026-10-09", { overnight: true }), day("2026-10-10", { overnight: true })],
      [],
      "2026-10-10"
    );
    expect(t.red).toBe(true); // 土曜
    expect(todayHoursText(t)).toBe("昨晩からの通し〜通し営業");
  });

  it("前日が通しでも前日が休業なら開店時刻", () => {
    const t = buildTodayBusiness(
      [day("2026-10-12", { status: "closed", overnight: true }), day("2026-10-14")],
      [],
      "2026-10-14"
    );
    expect(t.start).toBe("10:00");
  });

  it("休業・臨時休業・未作成", () => {
    expect(todayHoursText(buildTodayBusiness([day("2026-10-14", { status: "closed" })], [], "2026-10-14"))).toBe("休業日");
    expect(todayHoursText(buildTodayBusiness([day("2026-10-14", { status: "temp_closed" })], [], "2026-10-14"))).toBe("臨時休業");
    const u = buildTodayBusiness([], [], "2026-10-14");
    expect(u.status).toBe("unknown");
    expect(u.dateLabel).toBe("10月14日（水）");
  });

  it("その日に掛かるイベント(複数日を含む)だけ", () => {
    const t = buildTodayBusiness(
      [day("2026-10-14")],
      [
        { start_date: "2026-10-14", end_date: "2026-10-14", title: "ライブ" },
        { start_date: "2026-10-12", end_date: "2026-10-18", title: "秋祭り" },
        { start_date: "2026-10-15", end_date: "2026-10-15", title: "翌日" },
      ],
      "2026-10-14"
    );
    expect(t.events).toEqual(["ライブ", "秋祭り"]);
  });
});
