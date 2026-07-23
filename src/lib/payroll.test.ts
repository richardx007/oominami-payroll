import { describe, expect, it } from "vitest";
import {
  computeIncomeTax,
  computePayslip,
  effectiveAt,
  PayrollError,
  type TaxTableRow,
} from "./payroll";
import {
  currentPeriod,
  datesInPeriod,
  nightMinutes,
  periodOf,
  standardBreakMinutes,
  workMinutes,
} from "./period";

describe("period", () => {
  it("25日締め・月末払いの期間を返す", () => {
    const p = periodOf(2026, 7);
    expect(p.start).toBe("2026-06-26");
    expect(p.end).toBe("2026-07-25");
    expect(p.paymentDate).toBe("2026-07-31");
    expect(p.label).toBe("2026年7月分");
  });

  it("1月分は前年12月26日開始", () => {
    const p = periodOf(2026, 1);
    expect(p.start).toBe("2025-12-26");
    expect(p.end).toBe("2026-01-25");
  });

  it("うるう年2月の支払日は29日", () => {
    expect(periodOf(2028, 2).paymentDate).toBe("2028-02-29");
  });

  it("26日以降は翌月分の期間になる(JST)", () => {
    // JST 2026-07-26 00:00 = UTC 2026-07-25 15:00
    const p = currentPeriod(new Date("2026-07-25T15:00:00Z"));
    expect(p.key).toBe("2026-08");
    // JST 2026-07-25 23:59 = UTC 2026-07-25 14:59
    const p2 = currentPeriod(new Date("2026-07-25T14:59:00Z"));
    expect(p2.key).toBe("2026-07");
  });

  it("期間の日数が正しい", () => {
    expect(datesInPeriod(periodOf(2026, 7))).toHaveLength(30);
  });

  it("勤務分数を計算する", () => {
    expect(workMinutes("09:00", "17:00", 60)).toBe(420);
    expect(workMinutes("09:30", "12:00", 0)).toBe(150);
  });

  it("退勤が翌日にまたぐ深夜勤務を計算する", () => {
    // 22:00→2:00(=26:00) 休憩0 → 4時間
    expect(workMinutes("22:00", "02:00", 0)).toBe(240);
    // 23:30→7:30 休憩60 → 8時間0分
    expect(workMinutes("23:30", "07:30", 60)).toBe(420);
  });

  it("深夜帯(22:00〜翌5:00)の勤務分数を計算する(標準休憩帯4:00-5:00は除外)", () => {
    // 深夜帯外の勤務は0
    expect(nightMinutes("09:00", "17:00")).toBe(0);
    // 22:00→翌2:00 → 全4時間が深夜帯(4-5休憩帯に掛からない)
    expect(nightMinutes("22:00", "02:00")).toBe(240);
    // 18:00→23:00 → 22:00〜23:00の1時間のみ深夜
    expect(nightMinutes("18:00", "23:00")).toBe(60);
    // 23:00→翌7:00 → 23:00〜翌5:00の6時間から標準休憩4:00-5:00(60分)を除き5時間
    expect(nightMinutes("23:00", "07:00")).toBe(300);
    // 03:00→09:00 → 3:00〜5:00の2時間から標準休憩4:00-5:00(60分)を除き1時間
    expect(nightMinutes("03:00", "09:00")).toBe(60);
    // ちょうど境界(5:00→22:00)は深夜0
    expect(nightMinutes("05:00", "22:00")).toBe(0);
  });

  it("標準休憩ルールで休憩分数を計算する(12-13/19-20/4-5時)", () => {
    // 昼の休憩帯に掛かる
    expect(standardBreakMinutes("09:00", "17:00")).toBe(60);
    // どの休憩帯にも掛からない短時間勤務は0
    expect(standardBreakMinutes("14:00", "17:00")).toBe(0);
    // 深夜勤務は4:00-5:00に掛かる
    expect(standardBreakMinutes("21:00", "06:00")).toBe(60);
    // 昼・夜またぎで2つの休憩帯に掛かると120分
    expect(standardBreakMinutes("10:00", "22:00")).toBe(120);
  });
});

describe("effectiveAt", () => {
  const rates = [
    { hourly_wage: 1100, effective_from: "2026-01-01" },
    { hourly_wage: 1200, effective_from: "2026-07-01" },
  ];

  it("適用開始日以前は古い時給、以後は新しい時給", () => {
    expect(effectiveAt(rates, "2026-06-30")?.hourly_wage).toBe(1100);
    expect(effectiveAt(rates, "2026-07-01")?.hourly_wage).toBe(1200);
  });

  it("最古の適用開始日より前は null", () => {
    expect(effectiveAt(rates, "2025-12-31")).toBeNull();
  });
});

const taxRows: TaxTableRow[] = [
  {
    min_amount: 88000,
    max_amount: 89000,
    tax_kou_0: 130,
    tax_kou_1: 0,
    tax_kou_2: 0,
    tax_kou_3: 0,
    tax_otsu: 3200,
  },
  {
    min_amount: 89000,
    max_amount: 90000,
    tax_kou_0: 180,
    tax_kou_1: 0,
    tax_kou_2: 0,
    tax_kou_3: 0,
    tax_otsu: 3200,
  },
];

describe("computeIncomeTax", () => {
  it("乙欄88,000円未満は3.063%切り捨て", () => {
    expect(computeIncomeTax(80000, "otsu", 0, [])).toBe(
      Math.floor(80000 * 0.03063)
    );
    expect(computeIncomeTax(87999, "otsu", 0, [])).toBe(
      Math.floor(87999 * 0.03063)
    );
  });

  it("甲欄88,000円未満は0円", () => {
    expect(computeIncomeTax(87999, "kou", 0, [])).toBe(0);
  });

  it("0円以下は0円", () => {
    expect(computeIncomeTax(0, "otsu", 0, [])).toBe(0);
  });

  it("88,000円以上は税額表を参照する", () => {
    expect(computeIncomeTax(88500, "otsu", 0, taxRows)).toBe(3200);
    expect(computeIncomeTax(88500, "kou", 0, taxRows)).toBe(130);
    expect(computeIncomeTax(89000, "kou", 0, taxRows)).toBe(180);
  });

  it("税額表にデータがなければエラー", () => {
    expect(() => computeIncomeTax(100000, "otsu", 0, taxRows)).toThrow(
      PayrollError
    );
  });

  it("税額表の最小「以上」金額未満は非課税(0円)", () => {
    // 最小の以上が105,000の表で、88,000〜105,000の帯は0円と判定する
    const rows = [
      {
        min_amount: 105000,
        max_amount: 107000,
        tax_kou_0: 170,
        tax_kou_1: 0,
        tax_kou_2: 0,
        tax_kou_3: 0,
        tax_otsu: 500,
      },
    ];
    expect(computeIncomeTax(90000, "otsu", 0, rows)).toBe(0);
    expect(computeIncomeTax(104999, "kou", 0, rows)).toBe(0);
    // 表の範囲内は通常どおり参照
    expect(computeIncomeTax(105000, "kou", 0, rows)).toBe(170);
  });
});

describe("computePayslip", () => {
  const base = {
    wageRates: [{ hourly_wage: 1200, effective_from: "2026-01-01" }],
    taxSettings: [
      {
        tax_category: "otsu" as const,
        dependents: 0,
        effective_from: "2026-01-01",
      },
    ],
    allowances: [{ lunch_allowance_per_day: 500, effective_from: "2026-01-01" }],
    taxRows: [],
    periodEnd: "2026-07-25",
  };

  it("基本給・交通費・昼食補助・所得税を計算する", () => {
    const result = computePayslip({
      ...base,
      entries: [
        {
          work_date: "2026-07-01",
          start_time: "09:00",
          end_time: "17:00",
          break_minutes: 60,
          transport_cost: 500,
        },
        {
          work_date: "2026-07-02",
          start_time: "10:00",
          end_time: "15:30",
          break_minutes: 30, // 入力値は無視され、標準休憩(12-13時=60分)が適用される
          transport_cost: 500,
        },
      ],
    });

    // 休憩は標準ルールで自動計算(両日とも12-13時に掛かり60分):
    // 1日目 10:00-17:00相当ではなく 09:00-17:00 実働420分 → 8,400円
    // 2日目 10:00-15:30 実働 330-60=270分 → 5,400円
    expect(result.base_pay).toBe(13800);
    expect(result.total_minutes).toBe(690);
    expect(result.work_days).toBe(2);
    expect(result.transport_total).toBe(1000);
    expect(result.lunch_total).toBe(1000);
    // 課税対象 = 基本給13800 + 深夜0 + 昼食1000 = 14800
    expect(result.taxable_amount).toBe(14800);
    expect(result.income_tax).toBe(Math.floor(14800 * 0.03063));
    expect(result.gross_pay).toBe(15800);
    expect(result.net_pay).toBe(15800 - result.income_tax);
  });

  it("深夜勤務手当(時給25%増)を計算する", () => {
    const result = computePayslip({
      ...base,
      entries: [
        {
          // 22:00→翌2:00 休憩0 → 実働4時間、うち深夜4時間
          work_date: "2026-07-10",
          start_time: "22:00",
          end_time: "02:00",
          break_minutes: 0,
          transport_cost: 0,
        },
      ],
    });
    // 基本給: 240分 × 1200 / 60 = 4800
    expect(result.base_pay).toBe(4800);
    expect(result.night_minutes).toBe(240);
    // 深夜手当: 240分 × 1200 × 0.25 / 60 = 1200
    expect(result.night_pay).toBe(1200);
    // 課税対象額 = 基本給 + 深夜手当 + 昼食補助(500)
    expect(result.taxable_amount).toBe(4800 + 1200 + 500);
    // 総支給 = 基本給 + 深夜手当 + 昼食補助 + 交通費(0)
    expect(result.gross_pay).toBe(4800 + 1200 + 500);
  });

  it("深夜勤務がない場合は深夜手当0", () => {
    const result = computePayslip({
      ...base,
      entries: [
        {
          work_date: "2026-07-01",
          start_time: "09:00",
          end_time: "17:00",
          break_minutes: 60,
          transport_cost: 0,
        },
      ],
    });
    expect(result.night_minutes).toBe(0);
    expect(result.night_pay).toBe(0);
  });

  it("退勤未入力(end_time=null)の日があるとエラー(締めを止める)", () => {
    expect(() =>
      computePayslip({
        ...base,
        entries: [
          {
            work_date: "2026-07-03",
            start_time: "10:00",
            end_time: null,
            break_minutes: 0,
            transport_cost: 0,
          },
        ],
      })
    ).toThrow(PayrollError);
  });

  it("時給の値上げが勤務日ごとに適用される", () => {
    const result = computePayslip({
      ...base,
      wageRates: [
        { hourly_wage: 1000, effective_from: "2026-01-01" },
        { hourly_wage: 1200, effective_from: "2026-07-01" },
      ],
      entries: [
        {
          work_date: "2026-06-30",
          start_time: "09:00",
          end_time: "12:00",
          break_minutes: 0,
          transport_cost: 0,
        },
        {
          work_date: "2026-07-01",
          start_time: "09:00",
          end_time: "12:00",
          break_minutes: 0,
          transport_cost: 0,
        },
      ],
    });
    // 6/30: 3h × 1000 = 3000 / 7/1: 3h × 1200 = 3600
    expect(result.base_pay).toBe(6600);
    expect(result.hourly_wage).toBe(1200); // 期間末時点
  });

  it("勤務0日なら全額0円", () => {
    const result = computePayslip({ ...base, entries: [] });
    expect(result.gross_pay).toBe(0);
    expect(result.income_tax).toBe(0);
    expect(result.net_pay).toBe(0);
  });

  it("時給未設定はエラー", () => {
    expect(() =>
      computePayslip({ ...base, wageRates: [], entries: [] })
    ).toThrow(PayrollError);
  });

  it("日割り計算は日単位で切り捨て", () => {
    const result = computePayslip({
      ...base,
      wageRates: [{ hourly_wage: 1000, effective_from: "2026-01-01" }],
      allowances: [],
      entries: [
        {
          work_date: "2026-07-01",
          start_time: "09:00",
          end_time: "09:50",
          break_minutes: 0,
          transport_cost: 0,
        },
      ],
    });
    // 50分 × 1000 / 60 = 833.33 → 833
    expect(result.base_pay).toBe(833);
  });
});
