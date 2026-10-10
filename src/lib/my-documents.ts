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

/** 源泉徴収票の宛先(支払を受ける者)の個人情報。システム管理者には伏せ字で届く(birthDate も "****-**-**") */
export type SlipProfile = { postalCode: string; address: string; birthDate: string };

type SlipSubject = { name: string; furigana: string; status: string };

/** 支払のある年ごとに源泉徴収票のデータを組み立てる(新しい順) */
function buildSlips(
  payments: SlipPayment[],
  subject: SlipSubject,
  profile: SlipProfile,
  firstWorkDate: string | null,
  lastWorkDate: string | null,
  employer: IssuerInfo["employer"],
  today: string
): WithholdingSlipData[] {
  const thisYear = Number(today.slice(0, 4));
  return slipYears(payments).map((year) => ({
    totals: computeWithholdingTotals(payments, year),
    // 退職済みの人は年の途中でも確定(退職後1か月以内に交付する義務があるため)
    inProgressAsOf: year >= thisYear && subject.status === "active" ? today : null,
    name: subject.name,
    furigana: subject.furigana,
    postalCode: profile.postalCode,
    address: profile.address,
    birthDate: profile.birthDate,
    change: midYearChange(year, firstWorkDate, lastWorkDate, subject.status !== "active"),
    employer,
  }));
}

type PayslipRow = {
  employee_id: string;
  gross_pay: number;
  transport_total: number;
  income_tax: number;
  tax_category: string;
  pay_periods: unknown;
};

function toPayment(s: PayslipRow): SlipPayment {
  const pp = s.pay_periods as { payment_date: string };
  return {
    payment_date: pp.payment_date,
    gross_pay: s.gross_pay,
    transport_total: s.transport_total,
    income_tax: s.income_tax,
    tax_category: s.tax_category,
  };
}

const PAYSLIP_SELECT =
  "employee_id, gross_pay, transport_total, income_tax, tax_category, pay_periods!inner(payment_date)";

/** 本人の源泉徴収票(支払のある年ごと・新しい順) */
export async function loadWithholdingSlips(
  supabase: SupabaseClient,
  employee: Employee,
  employer: IssuerInfo["employer"],
  today: string
): Promise<WithholdingSlipData[]> {
  const [{ data: slips }, { data: me }, { data: profile }, { data: first }, { data: last }] =
    await Promise.all([
      supabase.from("payslips").select(PAYSLIP_SELECT).eq("employee_id", employee.id),
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

  return buildSlips(
    ((slips ?? []) as PayslipRow[]).map(toPayment),
    { name: employee.name, furigana: me?.furigana ?? "", status: employee.status },
    {
      postalCode: profile?.postal_code ?? "",
      address: profile?.address ?? "",
      birthDate: profile?.birth_date ?? "",
    },
    first?.work_date ?? null,
    last?.work_date ?? null,
    employer,
    today
  );
}

/** 管理者が見る、従業員ごとの源泉徴収票(在職・退職とも)。個人情報はオーナー以外には伏せ字で届く */
export type AdminSlipRow = {
  employeeId: string;
  employeeNo: string;
  name: string;
  status: string;
  slip: WithholdingSlipData;
};

export async function loadAllWithholdingSlips(
  supabase: SupabaseClient,
  year: number,
  employer: IssuerInfo["employer"],
  today: string
): Promise<{ years: number[]; rows: AdminSlipRow[] }> {
  // Supabase は1回の取得が最大1000行なので、明細・勤務記録は1000行ずつ分けて全件取る
  const fetchAll = async <T,>(
    query: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
  ): Promise<T[]> => {
    const PAGE = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data } = await query(from, from + PAGE - 1);
      out.push(...(data ?? []));
      if ((data ?? []).length < PAGE) return out;
    }
  };
  const [slips, { data: emps }, { data: profiles }, entries] = await Promise.all([
    fetchAll<PayslipRow>((a, b) => supabase.from("payslips").select(PAYSLIP_SELECT).order("id").range(a, b)),
    supabase
      .from("employees")
      .select("id, employee_no, name, furigana, status")
      .eq("is_admin", false)
      .order("employee_no"),
    supabase.rpc("employee_profiles_for_admin"),
    fetchAll<{ employee_id: string; work_date: string }>((a, b) =>
      supabase.from("work_entries").select("employee_id, work_date").order("id").range(a, b)
    ),
  ]);

  const payments = new Map<string, SlipPayment[]>();
  for (const s of slips) {
    const list = payments.get(s.employee_id) ?? [];
    list.push(toPayment(s));
    payments.set(s.employee_id, list);
  }
  const profileOf = new Map(
    ((profiles ?? []) as { employee_id: string; postal_code: string; address: string; birth_date: string }[]).map(
      (p) => [p.employee_id, { postalCode: p.postal_code, address: p.address, birthDate: p.birth_date }]
    )
  );
  const firstOf = new Map<string, string>();
  const lastOf = new Map<string, string>();
  for (const e of entries) {
    const f = firstOf.get(e.employee_id);
    if (!f || e.work_date < f) firstOf.set(e.employee_id, e.work_date);
    const l = lastOf.get(e.employee_id);
    if (!l || e.work_date > l) lastOf.set(e.employee_id, e.work_date);
  }

  const allPayments = Array.from(payments.values()).flat();
  const rows: AdminSlipRow[] = [];
  for (const emp of emps ?? []) {
    const slip = buildSlips(
      payments.get(emp.id) ?? [],
      { name: emp.name, furigana: emp.furigana ?? "", status: emp.status },
      profileOf.get(emp.id) ?? { postalCode: "", address: "", birthDate: "" },
      firstOf.get(emp.id) ?? null,
      lastOf.get(emp.id) ?? null,
      employer,
      today
    ).find((x) => x.totals.year === year);
    // 明細はあっても支払額も税額も0円の人(勤務の無い月だけ)は出さない
    if (slip && (slip.totals.paymentTotal > 0 || slip.totals.taxTotal > 0)) {
      rows.push({ employeeId: emp.id, employeeNo: emp.employee_no, name: emp.name, status: emp.status, slip });
    }
  }
  return { years: slipYears(allPayments), rows };
}
