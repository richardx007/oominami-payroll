import { describe, it, expect } from "vitest";
import { periodKeyForDate } from "./period";

describe("periodKeyForDate(給与期間: 前月26日〜当月25日)", () => {
  it("25日以前はその月度に含める", () => {
    expect(periodKeyForDate("2026-09-07")).toBe("2026-09");
    expect(periodKeyForDate("2026-09-25")).toBe("2026-09");
  });

  it("26日以降は翌月度に含める", () => {
    expect(periodKeyForDate("2026-08-26")).toBe("2026-09");
    expect(periodKeyForDate("2026-08-31")).toBe("2026-09");
  });

  it("年をまたぐ", () => {
    expect(periodKeyForDate("2026-12-26")).toBe("2027-01");
    expect(periodKeyForDate("2027-01-25")).toBe("2027-01");
  });
});
