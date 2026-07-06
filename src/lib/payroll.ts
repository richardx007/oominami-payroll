import { workMinutes } from "./period";

/**
 * 給与計算エンジン(純粋関数)
 *
 * 計算方法:
 * - 基本給 = Σ(勤務日ごとの 勤務分数 × 時給 ÷ 60、日単位で切り捨て)
 *   時給は勤務日時点で有効な wage_rates を適用(値上げ対応)
 * - 交通費 = 申告実費の合計(非課税として扱う)
 * - 昼食補助 = 勤務日数 × 定額(課税対象として扱う)
 * - 課税対象額 = 基本給 + 昼食補助
 * - 源泉所得税 = 月額表(甲欄/乙欄)による
 *   - 乙欄: 88,000円未満は課税対象額 × 3.063%(1円未満切り捨て)、以上は税額表を参照
 *   - 甲欄: 88,000円未満は 0円、以上は税額表(扶養親族数別)を参照
 */

export type WorkEntryInput = {
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  transport_cost: number;
};

export type WageRate = { hourly_wage: number; effective_from: string };
export type TaxSetting = {
  tax_category: "kou" | "otsu";
  dependents: number;
  effective_from: string;
};
export type Allowance = {
  lunch_allowance_per_day: number;
  effective_from: string;
};
export type TaxTableRow = {
  min_amount: number;
  max_amount: number | null;
  tax_kou_0: number | null;
  tax_kou_1: number | null;
  tax_kou_2: number | null;
  tax_kou_3: number | null;
  tax_otsu: number;
};

export type PayslipResult = {
  work_days: number;
  total_minutes: number;
  hourly_wage: number; // 期間末時点の時給(明細表示用)
  base_pay: number;
  transport_total: number;
  lunch_total: number;
  gross_pay: number;
  taxable_amount: number;
  income_tax: number;
  net_pay: number;
  tax_category: "kou" | "otsu";
};

/** 指定日時点で有効な設定(effective_from <= date の最新)を返す */
export function effectiveAt<T extends { effective_from: string }>(
  rows: T[],
  date: string
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.effective_from <= date) {
      if (!best || r.effective_from > best.effective_from) best = r;
    }
  }
  return best;
}

export class PayrollError extends Error {}

/** 源泉所得税を計算する */
export function computeIncomeTax(
  taxable: number,
  category: "kou" | "otsu",
  dependents: number,
  taxRows: TaxTableRow[]
): number {
  if (taxable <= 0) return 0;

  if (taxable < 88000) {
    if (category === "kou") return 0;
    return Math.floor(taxable * 0.03063);
  }

  const row = taxRows.find(
    (r) =>
      taxable >= r.min_amount &&
      (r.max_amount === null || taxable < r.max_amount)
  );
  if (!row) {
    throw new PayrollError(
      `課税対象額 ¥${taxable.toLocaleString()} に対応する税額表(月額表)のデータがありません。設定画面から税額表を登録してください。`
    );
  }

  if (category === "otsu") return row.tax_otsu;

  const kouTaxes = [row.tax_kou_0, row.tax_kou_1, row.tax_kou_2, row.tax_kou_3];
  const tax = kouTaxes[Math.min(dependents, 3)];
  if (tax === null || tax === undefined) {
    throw new PayrollError(
      `甲欄(扶養${dependents}人)の税額表データがありません。税額表を確認してください。`
    );
  }
  return tax;
}

/** 1人分の給与明細を計算する */
export function computePayslip(params: {
  entries: WorkEntryInput[];
  wageRates: WageRate[];
  taxSettings: TaxSetting[];
  allowances: Allowance[];
  taxRows: TaxTableRow[];
  periodEnd: string;
}): PayslipResult {
  const { entries, wageRates, taxSettings, allowances, taxRows, periodEnd } =
    params;

  if (wageRates.length === 0) {
    throw new PayrollError("時給が設定されていません");
  }

  let basePay = 0;
  let totalMinutes = 0;
  let transportTotal = 0;

  for (const e of entries) {
    const wage = effectiveAt(wageRates, e.work_date);
    if (!wage) {
      throw new PayrollError(
        `${e.work_date} 時点で有効な時給が設定されていません`
      );
    }
    const minutes = workMinutes(e.start_time, e.end_time, e.break_minutes);
    totalMinutes += minutes;
    basePay += Math.floor((minutes * wage.hourly_wage) / 60);
    transportTotal += e.transport_cost;
  }

  const allowance = effectiveAt(allowances, periodEnd);
  const lunchTotal = (allowance?.lunch_allowance_per_day ?? 0) * entries.length;

  const taxSetting = effectiveAt(taxSettings, periodEnd);
  const category = taxSetting?.tax_category ?? "otsu";
  const dependents = taxSetting?.dependents ?? 0;

  const taxable = basePay + lunchTotal;
  const incomeTax = computeIncomeTax(taxable, category, dependents, taxRows);

  const grossPay = basePay + lunchTotal + transportTotal;
  const currentWage = effectiveAt(wageRates, periodEnd);

  return {
    work_days: entries.length,
    total_minutes: totalMinutes,
    hourly_wage: currentWage?.hourly_wage ?? wageRates[0].hourly_wage,
    base_pay: basePay,
    transport_total: transportTotal,
    lunch_total: lunchTotal,
    gross_pay: grossPay,
    taxable_amount: taxable,
    income_tax: incomeTax,
    net_pay: grossPay - incomeTax,
    tax_category: category,
  };
}
