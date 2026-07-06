import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { formatMinutes } from "@/lib/period";

export default async function PayslipsPage() {
  const employee = await requireEmployee();
  const supabase = await createClient();

  const { data: payslips } = await supabase
    .from("payslips")
    .select(
      `work_days, total_minutes, hourly_wage, base_pay, transport_total,
       lunch_total, gross_pay, income_tax, net_pay, tax_category, finalized_at,
       pay_periods ( period_label, payment_date, status )`
    )
    .eq("employee_id", employee.id)
    .order("finalized_at", { ascending: false });

  type Slip = NonNullable<typeof payslips>[number] & {
    pay_periods: {
      period_label: string;
      payment_date: string;
      status: string;
    } | null;
  };

  const rows = (payslips ?? []) as Slip[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">給与明細</h1>
      {rows.length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          給与明細はまだありません
        </p>
      )}
      {rows.map((slip, i) => (
        <details
          key={i}
          className="group rounded-xl border border-gray-200 bg-white"
          open={i === 0}
        >
          <summary className="flex cursor-pointer items-center justify-between p-4">
            <div>
              <div className="font-semibold">
                {slip.pay_periods?.period_label}
              </div>
              <div className="text-xs text-gray-500">
                支払日 {slip.pay_periods?.payment_date.replaceAll("-", "/")}
                {slip.pay_periods?.status === "paid" && (
                  <span className="ml-1 rounded bg-green-50 px-1.5 py-0.5 text-green-700">
                    支払済み
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">差引支給額</div>
              <div className="text-lg font-bold">
                ¥{slip.net_pay.toLocaleString()}
              </div>
            </div>
          </summary>
          <div className="border-t border-gray-100 p-4">
            <dl className="space-y-2 text-sm">
              <Row label="勤務日数" value={`${slip.work_days}日`} />
              <Row
                label="勤務時間"
                value={formatMinutes(slip.total_minutes) || "0時間"}
              />
              <Row
                label={`基本給(時給 ¥${slip.hourly_wage.toLocaleString()})`}
                value={`¥${slip.base_pay.toLocaleString()}`}
              />
              <Row
                label="交通費"
                value={`¥${slip.transport_total.toLocaleString()}`}
              />
              <Row
                label="昼食補助"
                value={`¥${slip.lunch_total.toLocaleString()}`}
              />
              <div className="border-t border-gray-100 pt-2">
                <Row
                  label="総支給額"
                  value={`¥${slip.gross_pay.toLocaleString()}`}
                  bold
                />
              </div>
              <Row
                label={`源泉所得税(${slip.tax_category === "kou" ? "甲欄" : "乙欄"})`}
                value={`−¥${slip.income_tax.toLocaleString()}`}
                negative
              />
              <div className="border-t border-gray-100 pt-2">
                <Row
                  label="差引支給額"
                  value={`¥${slip.net_pay.toLocaleString()}`}
                  bold
                />
              </div>
            </dl>
          </div>
        </details>
      ))}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`${bold ? "font-bold" : ""} ${negative ? "text-red-600" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
