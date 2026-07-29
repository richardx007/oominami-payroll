import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { adjacentPeriodKey, currentPeriod, periodFromKey } from "@/lib/period";
import { PayslipView, type Slip } from "./ui";

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
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("id, payment_date, status")
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .maybeSingle();

  let slip: Slip | null = null;
  if (payPeriod) {
    const { data } = await supabase
      .from("payslips")
      .select(
        `work_days, total_minutes, night_minutes, overtime_minutes, hourly_wage, base_pay, night_pay,
         overtime_pay, transport_total, lunch_total, gross_pay, income_tax, advance_deduction,
         net_pay, tax_category`
      )
      .eq("employee_id", employee.id)
      .eq("pay_period_id", payPeriod.id)
      .maybeSingle();
    if (data) {
      slip = { ...data, status: payPeriod.status };
    }
  }

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

      <PayslipView period={period} slip={slip} />
    </div>
  );
}
