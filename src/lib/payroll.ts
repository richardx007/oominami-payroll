import {
  workMinutes,
  nightMinutes,
  standardBreakMinutes,
  overtimeMinutes,
} from "./period";
import { DEFAULT_BREAK_WINDOWS, type BreakWindow } from "./breaks";

/**
 * 給与計算エンジン(純粋関数)
 *
 * 計算方法:
 * - 基本給 = Σ(勤務日ごとの 勤務分数 × 時給 ÷ 60、日単位で切り捨て)
 *   時給は勤務日時点で有効な wage_rates を適用(値上げ対応)
 *   休憩は労使合意の標準休憩帯(12-13/19-20/4-5時)から導出する(入力値 break_minutes は使わない)
 * - 交通費 = 申告実費の合計(非課税として扱う)
 * - 昼食補助 = 勤務日数 × 定額(課税対象として扱う)
 * - 深夜勤務手当 = Σ(勤務日ごとの 深夜勤務分数 × 時給 × 25% ÷ 60、日単位で切り捨て)
 *   深夜勤務分数は勤務時間のうち 22:00〜翌5:00 に該当する時間から標準休憩帯ぶんを除いたもの。
 *   基本給とは別に単価の25%分を割増手当として追加支給する(課税対象)
 * - 残業手当 = Σ(勤務日ごとの 残業分数 × 時給 × 25% ÷ 60、日単位で切り捨て)
 *   残業分数は1日の勤務分数(休憩控除後)のうち8時間(480分)を超えた分。
 *   基本給とは別に単価の25%分を割増手当として追加支給する(課税対象)
 * - 課税対象額 = 基本給 + 深夜勤務手当 + 残業手当 + 昼食補助（交通費は非課税のため含めない。
 *   国税庁の月額表の基準額「その月の社会保険料等控除後の給与等の金額」も非課税の通勤手当を
 *   含まない額のため、この扱いで一致する）
 * - 源泉所得税 = 月額表(甲欄/乙欄)による。表の最小登録額(年度により異なる。例: 令和8年分は
 *   105,000円)未満は「(最小額)円未満」の帯として扱う:
 *   - 乙欄: 表の最小登録額未満は課税対象額 × 3.063%(1円未満切り捨て)、以上は税額表を参照
 *   - 甲欄: 表の最小登録額未満は 0円、以上は税額表(扶養親族数別)を参照
 * - 前払金控除 = 当期の勤務日に対して日当として先に現金で支払った額の合計
 *   総支給額・課税対象額・源泉所得税には影響させず、差引支給額からのみ差し引く
 *   (所得の控除ではなく既払い分の精算のため、源泉徴収は月額表による月単位の計算のまま)
 * - 差引支給額 = 総支給額 - 源泉所得税 - 前払金控除
 */

export type WorkEntryInput = {
  work_date: string;
  start_time: string;
  end_time: string | null;
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
  tax_kou_4?: number | null;
  tax_kou_5?: number | null;
  tax_kou_6?: number | null;
  tax_kou_7?: number | null;
  tax_otsu: number;
};

export type PayslipResult = {
  work_days: number;
  total_minutes: number;
  night_minutes: number; // 深夜帯(22:00〜翌5:00)の勤務分数
  overtime_minutes: number; // 1日8時間を超えた残業分数
  hourly_wage: number; // 期間末時点の時給(明細表示用)
  base_pay: number;
  night_pay: number; // 深夜勤務手当(単価の25%割増分)
  overtime_pay: number; // 残業手当(単価の25%割増分)
  transport_total: number;
  lunch_total: number;
  gross_pay: number;
  taxable_amount: number;
  income_tax: number;
  /** 前払金控除(日当として先に支払った額の合計)。差引支給額からのみ差し引く */
  advance_deduction: number;
  /** 差引支給額 = 総支給額 - 源泉所得税 - 前払金控除(前払いが多ければマイナスになりうる) */
  net_pay: number;
  tax_category: "kou" | "otsu";
  /** 仮計算(ignoreIncomplete)で計算対象から除外した勤務日(退勤未入力のため)。
   *  通常計算(ignoreIncomplete省略/false)では常に空配列 */
  excluded_dates: string[];
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

/** 税額表データが1件も無い場合にのみ使う暫定の「表の下限」。令和年度によって国税庁の
 *  月額表の先頭「(最小額)円未満」の境界は変わりうる(例: 令和8年分は105,000円)ため、
 *  税額表データが1件でもあればそちらの最小`min_amount`を優先して使う(下記参照)。 */
const FALLBACK_TABLE_MIN = 88000;

/** 源泉所得税を計算する */
export function computeIncomeTax(
  taxable: number,
  category: "kou" | "otsu",
  dependents: number,
  taxRows: TaxTableRow[]
): number {
  if (taxable <= 0) return 0;

  const row = taxRows.find(
    (r) =>
      taxable >= r.min_amount &&
      (r.max_amount === null || taxable < r.max_amount)
  );
  if (!row) {
    // 税額表に該当行が無い場合、課税対象額が税額表の最小「以上」金額未満
    // (国税庁の月額表の先頭「(最小額)円未満」の行に相当)なら、
    // **甲欄は0円、乙欄は課税対象額の3.063%(1円未満切り捨て)**。
    // ⚠️ 以前は「甲欄・乙欄とも0円」としていたが誤り(2026-08-21発覚)。国税庁の月額表は
    // 先頭行でも乙欄だけは「その月の給与等の金額の3.063%に相当する金額」であり0円ではない。
    // 表の最小額は年度改正で変わりうるため(例: 令和8年分は105,000円)ハードコードせず、
    // 税額表データが1件でもあればその最小`min_amount`を「表の下限」として使う。
    const tableMin =
      taxRows.length > 0
        ? Math.min(...taxRows.map((r) => r.min_amount))
        : FALLBACK_TABLE_MIN;
    if (taxable < tableMin) {
      if (category === "kou") return 0;
      return Math.floor(taxable * 0.03063);
    }
    throw new PayrollError(
      `課税対象額 ¥${taxable.toLocaleString()} に対応する税額表(月額表)のデータがありません。設定画面から税額表を登録してください。`
    );
  }

  if (category === "otsu") return row.tax_otsu;

  const kouTaxes = [
    row.tax_kou_0,
    row.tax_kou_1,
    row.tax_kou_2,
    row.tax_kou_3,
    row.tax_kou_4,
    row.tax_kou_5,
    row.tax_kou_6,
    row.tax_kou_7,
  ];
  const tax = kouTaxes[Math.min(dependents, 7)];
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
  /** 標準休憩時間帯(設定画面で変更可)。未指定なら既定値(12-13/19-20/4-5時) */
  breakWindows?: BreakWindow[];
  /** 当期に日当として先に支払った前払金の合計(未指定なら0) */
  advanceTotal?: number;
  /**
   * true の場合、退勤未入力の日をエラーにせず計算対象から除外する(締め前の「税額仮計算」用)。
   * 締め処理本体(実際の締め)では使わないこと(退勤未入力を見逃したまま確定してしまうため)。
   */
  ignoreIncomplete?: boolean;
}): PayslipResult {
  const {
    entries,
    wageRates,
    taxSettings,
    allowances,
    taxRows,
    periodEnd,
    breakWindows = DEFAULT_BREAK_WINDOWS,
    advanceTotal = 0,
    ignoreIncomplete = false,
  } = params;

  if (wageRates.length === 0) {
    throw new PayrollError("時給が設定されていません");
  }

  // 退勤未入力(end_time が null/空)の日は本来計算できない。通常はエラーにして締めを止めるが、
  // ignoreIncomplete=true(仮計算)のときは日付を記録した上で計算対象から除外して続行する。
  const missingOut = entries
    .filter((e) => !e.end_time)
    .map((e) => e.work_date);
  if (missingOut.length > 0 && !ignoreIncomplete) {
    throw new PayrollError(`退勤未入力の日があります: ${missingOut.join("、")}`);
  }
  const usableEntries = ignoreIncomplete
    ? entries.filter((e) => e.end_time)
    : entries;

  let basePay = 0;
  let totalMinutes = 0;
  let nightMins = 0;
  let nightPay = 0;
  let overtimeMins = 0;
  let overtimePay = 0;
  let transportTotal = 0;

  for (const e of usableEntries) {
    const wage = effectiveAt(wageRates, e.work_date);
    if (!wage) {
      throw new PayrollError(
        `${e.work_date} 時点で有効な時給が設定されていません`
      );
    }
    // 休憩は標準休憩ルール(breakWindows)から導出する。入力された break_minutes は使わない
    // (休憩を何時に取るかで深夜割増が変わらないよう労使合意の原則ルールで計算する)。
    const brk = standardBreakMinutes(e.start_time, e.end_time as string, breakWindows);
    const minutes = workMinutes(e.start_time, e.end_time as string, brk);
    totalMinutes += minutes;
    basePay += Math.floor((minutes * wage.hourly_wage) / 60);
    // 深夜勤務手当: 深夜帯の勤務分数(標準休憩ぶんを除く)に対し時給の25%を割増して追加支給(日単位で切り捨て)
    const nm = nightMinutes(e.start_time, e.end_time as string, breakWindows);
    nightMins += nm;
    nightPay += Math.floor((nm * wage.hourly_wage * 0.25) / 60);
    // 残業手当: その日の勤務分数(休憩控除後)のうち8時間を超えた分に時給の25%を割増して追加支給
    const om = overtimeMinutes(minutes);
    overtimeMins += om;
    overtimePay += Math.floor((om * wage.hourly_wage * 0.25) / 60);
    transportTotal += e.transport_cost;
  }

  const allowance = effectiveAt(allowances, periodEnd);
  const lunchTotal =
    (allowance?.lunch_allowance_per_day ?? 0) * usableEntries.length;

  const taxSetting = effectiveAt(taxSettings, periodEnd);
  const category = taxSetting?.tax_category ?? "otsu";
  const dependents = taxSetting?.dependents ?? 0;

  const taxable = basePay + nightPay + overtimePay + lunchTotal;
  const incomeTax = computeIncomeTax(taxable, category, dependents, taxRows);

  const grossPay = basePay + nightPay + overtimePay + lunchTotal + transportTotal;
  const currentWage = effectiveAt(wageRates, periodEnd);

  return {
    work_days: usableEntries.length,
    total_minutes: totalMinutes,
    night_minutes: nightMins,
    overtime_minutes: overtimeMins,
    hourly_wage: currentWage?.hourly_wage ?? wageRates[0].hourly_wage,
    base_pay: basePay,
    night_pay: nightPay,
    overtime_pay: overtimePay,
    transport_total: transportTotal,
    lunch_total: lunchTotal,
    gross_pay: grossPay,
    taxable_amount: taxable,
    income_tax: incomeTax,
    advance_deduction: advanceTotal,
    // 前払金は課税対象額・源泉所得税には影響させず、差引支給額からのみ控除する
    net_pay: grossPay - incomeTax - advanceTotal,
    tax_category: category,
    excluded_dates: ignoreIncomplete ? missingOut : [],
  };
}
