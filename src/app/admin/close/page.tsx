import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  adjacentPeriodKey,
  currentPeriod,
  formatMinutes,
  periodFromKey,
} from "@/lib/period";
import { calculatePeriodPayroll } from "@/lib/payroll-data";
import { CloseActions } from "./ui";

export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireAdmin();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();
  const [{ data: payPeriod }, payrolls] = await Promise.all([
    supabase
      .from("pay_periods")
      .select("status")
      .eq("start_date", period.start)
      .eq("end_date", period.end)
      .maybeSingle(),
    calculatePeriodPayroll(period),
  ]);

  const status = payPeriod?.status ?? "open";
  const totals = payrolls.reduce(
    (acc, p) => {
      if (p.result) {
        acc.gross += p.result.gross_pay;
        acc.tax += p.result.income_tax;
        acc.net += p.result.net_pay;
      }
      return acc;
    },
    { gross: 0, tax: 0, net: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">締め処理</h1>
          <p className="mt-1 text-sm text-gray-500">
            {period.label}({period.start.replaceAll("-", "/")} 〜{" "}
            {period.end.replaceAll("-", "/")}、支払日{" "}
            {period.paymentDate.replaceAll("-", "/")})
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href={`/admin/close?p=${adjacentPeriodKey(period.key, -1)}`}
            className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
          >
            ← 前月
          </Link>
          <Link
            href={`/admin/close?p=${adjacentPeriodKey(period.key, 1)}`}
            className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
          >
            翌月 →
          </Link>
        </div>
      </div>

      <CloseActions periodKey={period.key} status={status} />

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h2 className="font-semibold">
            {status === "open" ? "給与計算プレビュー" : "確定明細"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            総支給 ¥{totals.gross.toLocaleString()} / 源泉所得税 ¥
            {totals.tax.toLocaleString()} / 差引支給 ¥
            {totals.net.toLocaleString()}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-4 py-2">No</th>
                <th className="px-4 py-2">氏名</th>
                <th className="px-4 py-2 text-right">日数</th>
                <th className="px-4 py-2 text-right">時間</th>
                <th className="px-4 py-2 text-right">基本給</th>
                <th className="px-4 py-2 text-right">交通費</th>
                <th className="px-4 py-2 text-right">昼食補助</th>
                <th className="px-4 py-2 text-right">総支給</th>
                <th className="px-4 py-2 text-right">所得税</th>
                <th className="px-4 py-2 text-right">差引支給</th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map((p) => (
                <tr key={p.employee_id} className="border-b border-gray-50">
                  <td className="px-4 py-3">{p.employee_no}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  {p.result ? (
                    <>
                      <td className="px-4 py-3 text-right">
                        {p.result.work_days}日
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatMinutes(p.result.total_minutes) || "0時間"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        ¥{p.result.base_pay.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        ¥{p.result.transport_total.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        ¥{p.result.lunch_total.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ¥{p.result.gross_pay.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        −¥{p.result.income_tax.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        ¥{p.result.net_pay.toLocaleString()}
                      </td>
                    </>
                  ) : (
                    <td colSpan={8} className="px-4 py-3 text-red-600">
                      {p.error}
                    </td>
                  )}
                </tr>
              ))}
              {payrolls.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    対象の雇用者がいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
