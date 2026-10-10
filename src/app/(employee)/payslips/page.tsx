import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { adjacentPeriodKey, currentPeriod, periodFromKey, todayJST } from "@/lib/period";
import { PayslipView, WithholdingSection, type Slip, type SlipPdf } from "./ui";
import { loadReimbursements } from "@/lib/expense-reimbursement";
import { buildPayslipResult, loadIssuerInfo, loadWithholdingSlips } from "@/lib/my-documents";

/**
 * 給与明細(従業員)。勤務表・日別実績と同様に、ヘッダの ＜ 月度 ＞ で月度単位に切り替える方式
 * (以前は確定済み明細を全件アコーディオン表示していたが、月度ナビ方式に統一した)。
 */
export default async function PayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const employee = await requireEmployee();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();
  // 給与明細PDFの支払元・印と、源泉徴収票の支払者(管理者の設定画面で登録)
  const issuerInfo = await loadIssuerInfo(supabase);
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("id, payment_date, status")
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .maybeSingle();

  let slip: Slip | null = null;
  let pdf: SlipPdf | null = null;
  if (payPeriod) {
    const { data } = await supabase
      .from("payslips")
      .select(
        `work_days, total_minutes, night_minutes, overtime_minutes, hourly_wage, base_pay, night_pay,
         overtime_pay, transport_total, lunch_total, gross_pay, income_tax, advance_deduction,
         net_pay, tax_category, expense_reimbursement`
      )
      .eq("employee_id", employee.id)
      .eq("pay_period_id", payPeriod.id)
      .maybeSingle();
    if (data) {
      // 立替の内訳(この月度の給与で精算する、自分が立て替えた経費。2026-10-07)
      const items =
        data.expense_reimbursement > 0
          ? ((
              await loadReimbursements(supabase, {
                periodId: payPeriod.id,
                status: payPeriod.status,
                end: period.end,
                employeeId: employee.id,
              })
            ).get(employee.id)?.items ?? [])
          : [];
      slip = { ...data, status: payPeriod.status, reimbursementItems: items };
      // 自分の給与明細PDF(管理者の給与明細画面の「PDF」と同じ帳票。2026-10-10 オーナー依頼)
      pdf = {
        issuer: issuerInfo.issuer,
        data: {
          name: employee.name,
          periodLabel: period.label,
          periodKey: period.key,
          start: period.start,
          end: period.end,
          paymentDate: payPeriod.payment_date,
          draft: false,
          result: await buildPayslipResult(period, data),
          reimbursement: { total: data.expense_reimbursement, items },
        },
      };
    }
  }

  // 源泉徴収票(支払のある年ごと)。住所・生年月日は本人が設定画面で入力する
  const withholdingSlips = await loadWithholdingSlips(
    supabase,
    employee,
    issuerInfo.employer,
    todayJST()
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/payslips?p=${adjacentPeriodKey(period.key, -1)}`}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </Link>
          <span className="text-lg font-extrabold tracking-tight text-blue-800">
            {period.label}
          </span>
          <Link
            href={`/payslips?p=${adjacentPeriodKey(period.key, 1)}`}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </Link>
        </div>
        <h1 className="text-xl font-bold">給与明細</h1>
      </div>

      <PayslipView period={period} slip={slip} pdf={pdf} />
      <WithholdingSection slips={withholdingSlips} />
    </div>
  );
}
