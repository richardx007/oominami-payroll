import { describe, it, expect } from "vitest";
import { periodOf } from "./period";
import { clampPeriodStart, isBeforePayrollStart } from "./payroll-start";

describe("運用開始日による給与期間の繰り下げ", () => {
  // 2026年8月分 = 7/26〜8/25(支払日 8/31)
  const aug = periodOf(2026, 8);

  it("前提: 給与期間は前月26日〜当月25日", () => {
    expect(aug.start).toBe("2026-07-26");
    expect(aug.end).toBe("2026-08-25");
  });

  it("未設定なら期間はそのまま", () => {
    expect(clampPeriodStart(aug, null)).toEqual(aug);
    expect(clampPeriodStart(aug, "")).toEqual(aug);
  });

  it("開始日が期間の途中にあれば開始日まで繰り下げる", () => {
    // 7/27開店で 7/27〜7/31 を日当払いしたケース。8月分は 8/1〜8/25 で計算する。
    const clamped = clampPeriodStart(aug, "2026-08-01");
    expect(clamped.start).toBe("2026-08-01");
    expect(clamped.end).toBe("2026-08-25");
    // ラベル・支払日は変わらない(「2026年8月分」を 8/31 に支払う)
    expect(clamped.label).toBe("2026年8月分");
    expect(clamped.paymentDate).toBe("2026-08-31");
  });

  it("開始日が期間の開始以前なら影響しない", () => {
    expect(clampPeriodStart(aug, "2026-07-01")).toEqual(aug);
    expect(clampPeriodStart(aug, "2026-07-26")).toEqual(aug);
  });

  it("不正な値は未設定扱い", () => {
    expect(clampPeriodStart(aug, "2026/08/01")).toEqual(aug);
    expect(clampPeriodStart(aug, "8月1日")).toEqual(aug);
  });

  it("開始日より後の期間には影響しない", () => {
    const sep = periodOf(2026, 9);
    expect(clampPeriodStart(sep, "2026-08-01")).toEqual(sep);
  });

  it("期間全体が開始日より前なら対象外と判定する", () => {
    // 2026年7月分 = 6/26〜7/25 は丸ごと 8/1 より前
    const jul = periodOf(2026, 7);
    expect(isBeforePayrollStart(jul, "2026-08-01")).toBe(true);
    expect(isBeforePayrollStart(aug, "2026-08-01")).toBe(false);
    expect(isBeforePayrollStart(jul, null)).toBe(false);
    // 繰り下げると start > end になり、対象の勤務が0件になる
    expect(clampPeriodStart(jul, "2026-08-01").start > jul.end).toBe(true);
  });
});
