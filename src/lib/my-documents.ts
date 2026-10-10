import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee } from "./auth";
import type { Period } from "./period";
import type { PayslipResult, WageBreakdown } from "./payroll";
import { calculatePeriodPayroll } from "./payroll-data";
import { parsePayslipIssuer, type PayslipIssuer } from "./payslip-issuer";
import {
  computeWithholdingTotals,
  midYearChange,
  slipYears,
  type SlipPayment,
} from "./withholding-slip";
import type { WithholdingSlipData } from "@/components/WithholdingSlipButton";

/**
 * 従業員が自分でダウンロードする書類(給与明細PDF・源泉徴収票)の元データ。
 * すべて本人のログインで読める範囲(RLS)だけを使う。支払元・印・支払者は
 * app_settings を直接読めないので payslip_issuer_public() から取る。
 */

export type IssuerInfo = {
  issuer: PayslipIssuer;
  employer: { name: string; address: string; phone: string };
};

export async function loadIssuerInfo(supabase: SupabaseClient): Promise<IssuerInfo> {
  const { data } = await supabase.rpc("payslip_issuer_public");
  const rows = (data ?? []) as { key: string; value: string | null }[];
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  return {
    issuer: parsePayslipIssuer(rows),
    employer: {
      // 支払者の名称が未設定なら会社名(メール設定の「会社名」)を使う
      name: map.get("employer_name") || map.get("company_name") || "",
      address: map.get("employer_address") ?? "",
      phone: map.get("employer_phone") ?? "",
    },
  };
}

/** 保存済みの明細(payslips の1行) */
export type StoredSlip = {
  work_days: number;
  total_minutes: number;
  night_minutes: number;
  overtime_minutes: number;
  hourly_wage: number;
  base_pay: number;
  night_pay: number;
  overtime_pay: number;
  transport_total: number;
  lunch_total: number;
  gross_pay: number;
  income_tax: number;
  advance_deduction: number;
  net_pay: number;
  tax_category: string;
};

/**
 * 給与明細PDF用の PayslipResult を作る。**金額は確定済みの明細(payslips)の値をそのまま使う。**
 * 月度の途中で時給が変わった人は「時給ごとの行」が要るので、管理者画面と同じ計算で内訳だけ取り、
 * 内訳の合計が確定額と一致するときだけ使う(合わなければ確定額で1行にまとめる)。
 */
export async function buildPayslipResult(period: Period, slip: StoredSlip): Promise<PayslipResult> {
  const single: WageBreakdown[] = [
    {
      hourly_wage: slip.hourly_wage,
      work_days: slip.work_days,
      total_minutes: slip.total_minutes,
      night_minutes: slip.night_minutes,
      overtime_minutes: slip.overtime_minutes,
      base_pay: slip.base_pay,
      night_pay: slip.night_pay,
      overtime_pay: slip.overtime_pay,
    },
  ];
  let breakdown = single;
  try {
    // RLS により本人の分だけが計算される
    const [mine] = await calculatePeriodPayroll(period);
    const b = mine?.result?.wage_breakdown;
    if (
      b &&
      b.length > 1 &&
      b.reduce((s, x) => s + x.base_pay, 0) === slip.base_pay &&
      b.reduce((s, x) => s + x.night_pay, 0) === slip.night_pay &&
      b.reduce((s, x) => s + x.overtime_pay, 0) === slip.overtime_pay
    ) {
      breakdown = b;
    }
  } catch {
    // 内訳が取れなくても明細は出す(確定額の1行で)
  }
  return {
    work_days: slip.work_days,
    total_minutes: slip.total_minutes,
    night_minutes: slip.night_minutes,
    overtime_minutes: slip.overtime_minutes,
    hourly_wage: slip.hourly_wage,
    base_pay: slip.base_pay,
    night_pay: slip.night_pay,
    overtime_pay: slip.overtime_pay,
    wage_breakdown: breakdown,
    transport_total: slip.transport_total,
    lunch_total: slip.lunch_total,
    gross_pay: slip.gross_pay,
    taxable_amount: slip.gross_pay - slip.transport_total,
    income_tax: slip.income_tax,
    advance_deduction: slip.advance_deduction,
    net_pay: slip.net_pay,
    tax_category: slip.tax_category === "kou" ? "kou" : "otsu",
    excluded_dates: [],
  };
}

/** 本人の源泉徴収票(支払のある年ごと・新しい順) */
export async function loadWithholdingSlips(
  supabase: SupabaseClient,
  employee: Employee,
  employer: IssuerInfo["employer"],
  today: string
): Promise<WithholdingSlipData[]> {
  const [{ data: slips }, { data: me }, { data: profile }, { data: first }, { data: last }] =
    await Promise.all([
      supabase
        .from("payslips")
        .select("gross_pay, transport_total, income_tax, tax_category, pay_periods!inner(payment_date)")
        .eq("employee_id", employee.id),
      supabase.from("employees").select("furigana").eq("id", employee.id).maybeSingle(),
      supabase
        .from("employee_profiles")
        .select("postal_code, address, birth_date")
        .eq("employee_id", employee.id)
        .maybeSingle(),
      supabase
        .from("work_entries")
        .select("work_date")
        .eq("employee_id", employee.id)
        .order("work_date")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("work_entries")
        .select("work_date")
        .eq("employee_id", employee.id)
        .order("work_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const payments: SlipPayment[] = (slips ?? []).map((s) => {
    const pp = s.pay_periods as unknown as { payment_date: string };
    return {
      payment_date: pp.payment_date,
      gross_pay: s.gross_pay,
      transport_total: s.transport_total,
      income_tax: s.income_tax,
      tax_category: s.tax_category,
    };
  });

  const thisYear = Number(today.slice(0, 4));
  return slipYears(payments).map((year) => ({
    totals: computeWithholdingTotals(payments, year),
    inProgressAsOf: year >= thisYear ? today : null,
    name: employee.name,
    furigana: me?.furigana ?? "",
    postalCode: profile?.postal_code ?? "",
    address: profile?.address ?? "",
    birthDate: profile?.birth_date ?? "",
    change: midYearChange(year, first?.work_date ?? null, last?.work_date ?? null, employee.status !== "active"),
    employer,
  }));
}
