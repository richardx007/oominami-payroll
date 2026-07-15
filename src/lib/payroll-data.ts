import { createClient } from "@/lib/supabase/server";
import type { Period } from "./period";
import {
  computePayslip,
  PayrollError,
  type PayslipResult,
  type TaxTableRow,
} from "./payroll";

export type EmployeePayroll = {
  employee_id: string;
  employee_no: string;
  name: string;
  result: PayslipResult | null;
  error: string | null;
};

/** 指定期間の全従業員の給与を計算する(プレビュー/締め共通) */
export async function calculatePeriodPayroll(
  period: Period
): Promise<EmployeePayroll[]> {
  const supabase = await createClient();
  const taxYear = Number(period.end.slice(0, 4));

  const [
    { data: employees },
    { data: entries },
    { data: wageRates },
    { data: taxSettings },
    { data: allowances },
    { data: taxRows },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_no, name")
      .eq("status", "active")
      .eq("is_admin", false)
      .order("employee_no"),
    supabase
      .from("work_entries")
      .select(
        "employee_id, work_date, start_time, end_time, break_minutes, transport_cost"
      )
      .gte("work_date", period.start)
      .lte("work_date", period.end),
    supabase
      .from("wage_rates")
      .select("employee_id, hourly_wage, effective_from"),
    supabase
      .from("tax_settings")
      .select("employee_id, tax_category, dependents, effective_from"),
    supabase
      .from("allowance_settings")
      .select("lunch_allowance_per_day, effective_from"),
    supabase
      .from("withholding_tax_table")
      .select(
        "min_amount, max_amount, tax_kou_0, tax_kou_1, tax_kou_2, tax_kou_3, tax_kou_4, tax_kou_5, tax_kou_6, tax_kou_7, tax_otsu"
      )
      .eq("year", taxYear),
  ]);

  const entriesBy = groupBy(entries ?? [], (e) => e.employee_id);
  const wagesBy = groupBy(wageRates ?? [], (w) => w.employee_id);
  const taxBy = groupBy(taxSettings ?? [], (t) => t.employee_id);

  return (employees ?? []).map((emp) => {
    const empEntries = (entriesBy.get(emp.id) ?? []).map((e) => ({
      ...e,
      start_time: e.start_time.slice(0, 5),
      // 退勤未入力(null)はそのまま渡し、computePayslip 側で「退勤未入力」エラーにする
      end_time: e.end_time ? e.end_time.slice(0, 5) : null,
    }));
    try {
      const result = computePayslip({
        entries: empEntries,
        wageRates: wagesBy.get(emp.id) ?? [],
        taxSettings: (taxBy.get(emp.id) ?? []).map((t) => ({
          ...t,
          tax_category: t.tax_category as "kou" | "otsu",
        })),
        allowances: allowances ?? [],
        taxRows: (taxRows ?? []) as TaxTableRow[],
        periodEnd: period.end,
      });
      return {
        employee_id: emp.id,
        employee_no: emp.employee_no,
        name: emp.name,
        result,
        error: null,
      };
    } catch (e) {
      return {
        employee_id: emp.id,
        employee_no: emp.employee_no,
        name: emp.name,
        result: null,
        error: e instanceof PayrollError ? e.message : "計算エラー",
      };
    }
  });
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const arr = map.get(k);
    if (arr) arr.push(row);
    else map.set(k, [row]);
  }
  return map;
}
