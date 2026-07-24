import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  adjacentPeriodKey,
  currentPeriod,
  periodFromKey,
} from "@/lib/period";

/** 分を「H:MM」表記にする(単位を省いて数字だけ・改行させない用) */
function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
import { calculatePeriodPayroll } from "@/lib/payroll-data";
import { periodStatusBadgeClass, periodStatusLabel } from "@/lib/period-status";
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
          <div className="flex flex-wrap items-center gap-3">
            {/* 前月/翌月は勤務表と同じ ＜ 年月 ＞ のスタイル・配色に統一 */}
            <div className="flex items-center gap-1.5">
              <Link
                href={`/admin/close?p=${adjacentPeriodKey(period.key, -1)}`}
                aria-label="前月"
                className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
              >
                ＜
              </Link>
              <span className="text-xl font-extrabold tracking-tight text-blue-800">
                {period.label}
              </span>
              <Link
                href={`/admin/close?p=${adjacentPeriodKey(period.key, 1)}`}
                aria-label="翌月"
                className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
              >
                ＞
              </Link>
            </div>
            <span className={periodStatusBadgeClass(status)}>
              {periodStatusLabel(status)}
            </span>
          </div>
          <p className="mt-1 whitespace-nowrap text-sm text-gray-500">
            締め日：{period.end.replaceAll("-", "/")}、支払日{" "}
            {period.paymentDate.replaceAll("-", "/")}
          </p>
        </div>

        {/* 操作ボタンはヘッダ部分に配置(締め/支払・明細配信・締め解除・税理士資料操作) */}
        <CloseActions periodKey={period.key} status={status} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="rounded-t-xl border-b border-blue-100 bg-blue-50/70 p-4">
          <div>
            <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
              {status === "open" ? "給与計算プレビュー" : "確定明細"}
            </h2>
            {/* 総支給・源泉所得税・差引支給は重要なので1項目1行・濃い黒字・金額右寄せで表示 */}
            <dl className="mt-2 max-w-xs space-y-1 text-sm font-semibold text-gray-900">
              <div className="flex items-baseline justify-between gap-4">
                <dt>総支給</dt>
                <dd className="tabular-nums">
                  ¥{totals.gross.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt>源泉所得税</dt>
                <dd className="tabular-nums">¥{totals.tax.toLocaleString()}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt>差引支給</dt>
                <dd className="tabular-nums">¥{totals.net.toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="overflow-x-auto print-report">
          <table className="w-full text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-blue-200 bg-blue-100 text-left text-xs font-semibold text-gray-700">
                <th className="sticky left-0 z-10 bg-blue-100 px-4 py-2 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]">
                  氏名
                </th>
                <th className="px-4 py-2 text-right">日数</th>
                <th className="px-4 py-2 text-right">勤務時間</th>
                <th className="px-4 py-2 text-right">うち深夜</th>
                <th className="px-4 py-2 text-right">基本時給</th>
                <th className="px-4 py-2 text-right">基本給</th>
                <th className="px-4 py-2 text-right">深夜手当</th>
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
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]">
                    {p.name}
                  </td>
                  {p.result ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {p.result.work_days}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {hhmm(p.result.total_minutes)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {p.result.night_minutes > 0
                          ? hhmm(p.result.night_minutes)
                          : "―"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        ¥{p.result.hourly_wage.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        ¥{p.result.base_pay.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        ¥{p.result.night_pay.toLocaleString()}
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
                      <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">
                        −¥{p.result.income_tax.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        ¥{p.result.net_pay.toLocaleString()}
                      </td>
                    </>
                  ) : (
                    <td colSpan={11} className="px-4 py-3 text-red-600">
                      {p.error}
                    </td>
                  )}
                </tr>
              ))}
              {payrolls.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    対象の従業員がいません
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
