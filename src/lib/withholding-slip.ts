/**
 * 給与所得の源泉徴収票(受給者交付用)の中身を組み立てる(純粋関数・テスト対象)。
 *
 * - 対象は「その年(1/1〜12/31)に**支払った**給与」。月度ではなく支払日(pay_periods.payment_date)で年を分ける
 *   (例: 2026年12月度=12/31払いは2026年分、2027年1月度=1/31払いは2027年分)。
 * - 支払金額 = 課税対象額の合計(総支給額 − 交通費)。交通費は非課税、立替精算は給与ではないので含めない。
 * - 源泉徴収税額 = 源泉所得税の合計。
 * - このシステムは年末調整をしないので「給与所得控除後の金額」「所得控除の額の合計額」は空欄。
 *   乙欄の人はそもそも年末調整の対象外。甲欄の月があれば摘要に「年末調整未済」と書く。
 * - お店は2026年7月開業なので、2026年分はこのシステムのデータだけで全額がそろう。
 */

export type SlipPayment = {
  /** 支払日 "YYYY-MM-DD" */
  payment_date: string;
  gross_pay: number;
  transport_total: number;
  income_tax: number;
  tax_category: string;
};

export type WithholdingSlipTotals = {
  year: number;
  /** 支払金額(課税対象額の合計) */
  paymentTotal: number;
  /** 源泉徴収税額 */
  taxTotal: number;
  /** その年に乙欄で計算した月がある */
  otsu: boolean;
  /** その年に甲欄で計算した月がある(年末調整をしていないので摘要に書く) */
  kou: boolean;
  /** 支払の回数 */
  count: number;
  /** 最後の支払日(年の途中の表示に使う) */
  lastPaymentDate: string | null;
};

export function computeWithholdingTotals(
  payments: SlipPayment[],
  year: number
): WithholdingSlipTotals {
  const inYear = payments.filter((p) => p.payment_date.startsWith(`${year}-`));
  let paymentTotal = 0;
  let taxTotal = 0;
  let lastPaymentDate: string | null = null;
  for (const p of inYear) {
    paymentTotal += p.gross_pay - p.transport_total;
    taxTotal += p.income_tax;
    if (!lastPaymentDate || p.payment_date > lastPaymentDate) lastPaymentDate = p.payment_date;
  }
  return {
    year,
    paymentTotal,
    taxTotal,
    otsu: inYear.some((p) => p.tax_category === "otsu"),
    kou: inYear.some((p) => p.tax_category === "kou"),
    count: inYear.length,
    lastPaymentDate,
  };
}

/** 支払のある年(新しい順) */
export function slipYears(payments: SlipPayment[]): number[] {
  const years = new Set(payments.map((p) => Number(p.payment_date.slice(0, 4))));
  return Array.from(years).sort((a, b) => b - a);
}

/** 和暦。源泉徴収票の年・生年月日・就退職日の表記に使う */
export type JapaneseDate = { era: string; year: number; month: number; day: number };

const ERAS = [
  { name: "令和", start: "2019-05-01", offset: 2018 },
  { name: "平成", start: "1989-01-08", offset: 1988 },
  { name: "昭和", start: "1926-12-25", offset: 1925 },
  { name: "大正", start: "1912-07-30", offset: 1911 },
] as const;

/** "YYYY-MM-DD" → 和暦 */
export function toJapaneseDate(iso: string): JapaneseDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const era = ERAS.find((e) => iso >= e.start);
  if (!era) return null;
  return { era: era.name, year: Number(m[1]) - era.offset, month: Number(m[2]), day: Number(m[3]) };
}

/** 「令和8年分」の年(西暦の年分 → 令和の年。2019年分は年の途中で改元したが令和元年分とする) */
export function reiwaYear(year: number): number {
  return year - 2018;
}

/**
 * 中途就職・退職の欄。その年の途中で働き始めた/辞めた場合だけ埋める。
 * 就職日は最初の勤務日、退職日は退職済みの人の最後の勤務日で代用する
 * (このシステムには入社日・退職日の項目が無いため)。
 */
export function midYearChange(
  year: number,
  firstWorkDate: string | null,
  lastWorkDate: string | null,
  retired: boolean
): { kind: "就職" | "退職"; date: string } | null {
  if (retired && lastWorkDate?.startsWith(`${year}-`)) {
    return { kind: "退職", date: lastWorkDate };
  }
  if (firstWorkDate?.startsWith(`${year}-`) && firstWorkDate > `${year}-01-01`) {
    return { kind: "就職", date: firstWorkDate };
  }
  return null;
}
