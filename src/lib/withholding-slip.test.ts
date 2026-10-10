import { describe, expect, it } from "vitest";
import {
  computeWithholdingTotals,
  midYearChange,
  reiwaYear,
  slipYears,
  toJapaneseDate,
  type SlipPayment,
} from "./withholding-slip";

const pay = (date: string, gross: number, transport: number, tax: number, cat = "otsu"): SlipPayment => ({
  payment_date: date,
  gross_pay: gross,
  transport_total: transport,
  income_tax: tax,
  tax_category: cat,
});

describe("computeWithholdingTotals", () => {
  const payments = [
    pay("2026-07-31", 100_000, 5_000, 3_000),
    pay("2026-08-31", 200_000, 10_000, 20_000),
    pay("2026-12-31", 150_000, 0, 9_000),
    pay("2027-01-31", 120_000, 2_000, 5_000),
  ];

  it("支払日の年で集計し、交通費を除いた額を支払金額にする", () => {
    const t = computeWithholdingTotals(payments, 2026);
    expect(t.paymentTotal).toBe(95_000 + 190_000 + 150_000);
    expect(t.taxTotal).toBe(32_000);
    expect(t.count).toBe(3);
    expect(t.lastPaymentDate).toBe("2026-12-31");
    expect(t.otsu).toBe(true);
    expect(t.kou).toBe(false);
  });

  it("翌年1月払いは翌年分", () => {
    const t = computeWithholdingTotals(payments, 2027);
    expect(t.paymentTotal).toBe(118_000);
    expect(t.count).toBe(1);
  });

  it("甲欄の月があれば kou", () => {
    expect(computeWithholdingTotals([pay("2026-09-30", 1, 0, 0, "kou")], 2026).kou).toBe(true);
  });

  it("支払が無い年は0", () => {
    const t = computeWithholdingTotals(payments, 2025);
    expect(t).toMatchObject({ paymentTotal: 0, taxTotal: 0, count: 0, lastPaymentDate: null });
  });
});

describe("slipYears", () => {
  it("新しい順", () => {
    expect(slipYears([pay("2026-07-31", 0, 0, 0), pay("2027-01-31", 0, 0, 0), pay("2026-08-31", 0, 0, 0)])).toEqual([
      2027, 2026,
    ]);
  });
});

describe("和暦", () => {
  it("toJapaneseDate", () => {
    expect(toJapaneseDate("2026-07-01")).toEqual({ era: "令和", year: 8, month: 7, day: 1 });
    expect(toJapaneseDate("1990-03-15")).toEqual({ era: "平成", year: 2, month: 3, day: 15 });
    expect(toJapaneseDate("1989-01-07")).toEqual({ era: "昭和", year: 64, month: 1, day: 7 });
    expect(toJapaneseDate("bad")).toBeNull();
  });
  it("reiwaYear", () => {
    expect(reiwaYear(2026)).toBe(8);
  });
});

describe("midYearChange", () => {
  it("年の途中で働き始めたら就職", () => {
    expect(midYearChange(2026, "2026-07-01", "2026-09-30", false)).toEqual({ kind: "就職", date: "2026-07-01" });
  });
  it("前の年から働いていれば空", () => {
    expect(midYearChange(2027, "2026-07-01", "2027-05-01", false)).toBeNull();
  });
  it("退職済みでその年に最後の勤務があれば退職", () => {
    expect(midYearChange(2026, "2026-07-01", "2026-09-30", true)).toEqual({ kind: "退職", date: "2026-09-30" });
  });
});
