import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  adjacentPeriodKey,
  currentPeriod,
  formatMinutes,
  periodFromKey,
} from "@/lib/period";
import { DownloadCsvButton, PrintButton, SendReportButton } from "./ui";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireAdmin();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("id, status, period_label, payment_date")
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .maybeSingle();

  const { data: payslips } = payPeriod
    ? await supabase
        .from("payslips")
        .select(
          `work_days, total_minutes, hourly_wage, base_pay, transport_total,
           lunch_total, gross_pay, income_tax, net_pay, tax_category,
           employees ( employee_no, name )`
        )
        .eq("pay_period_id", payPeriod.id)
    : { data: null };

  type Row = NonNullable<typeof payslips>[number];
  const rows = ((payslips ?? []) as Row[])
    .map((r) => ({
      ...r,
      emp: r.employees as unknown as { employee_no: string; name: string },
    }))
    .sort((a, b) => a.emp.employee_no.localeCompare(b.emp.employee_no));

  const totals = rows.reduce(
    (acc, r) => ({
      base: acc.base + r.base_pay,
      transport: acc.transport + r.transport_total,
      lunch: acc.lunch + r.lunch_total,
      gross: acc.gross + r.gross_pay,
      tax: acc.tax + r.income_tax,
      net: acc.net + r.net_pay,
    }),
    { base: 0, transport: 0, lunch: 0, gross: 0, tax: 0, net: 0 }
  );

  const prevNextNav = (
    <div className="flex gap-2 text-sm print:hidden">
      <Link
        href={`/admin/report?p=${adjacentPeriodKey(period.key, -1)}`}
        className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-200"
      >
        ← 前月
      </Link>
      <Link
        href={`/admin/report?p=${adjacentPeriodKey(period.key, 1)}`}
        className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-200"
      >
        翌月 →
      </Link>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-xl font-bold">税理士向け資料</h1>
          <p className="mt-1 text-sm text-gray-500">
            締め済みの期間の給与集計を表示します。「印刷 / PDF保存」でPDF化、「CSVダウンロード」で表計算用データを保存、「税理士へメール送信」で支給一覧CSVを添付して税理士へ自動送信します(送信時に補足事項を追記できます)
          </p>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 text-sm">
            <SendReportButton periodKey={period.key} />
            <PrintButton />
            <DownloadCsvButton periodKey={period.key} />
          </div>
        )}
      </div>

      {!payPeriod || rows.length === 0 ? (
        <div className="space-y-4">
          <div className="flex justify-end">{prevNextNav}</div>
          <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            {period.label}
            はまだ締められていません。締め処理を実行すると集計が表示されます。
          </p>
        </div>
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white p-6 print:border-0 print:p-0">
          {/* 帳票ヘッダー */}
          <div className="border-b border-gray-200 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold">
                給与支給一覧表 {payPeriod.period_label}
              </h2>
              {prevNextNav}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              対象期間: {period.start.replaceAll("-", "/")} 〜{" "}
              {period.end.replaceAll("-", "/")} / 支給日:{" "}
              {payPeriod.payment_date.replaceAll("-", "/")} / 状態:{" "}
              {payPeriod.status === "paid" ? "支払済み" : "締め済み"}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-2 pr-2">No</th>
                  <th className="py-2 pr-2">氏名</th>
                  <th className="py-2 pr-2 text-right">日数</th>
                  <th className="py-2 pr-2 text-right">時間</th>
                  <th className="py-2 pr-2 text-right">基本給</th>
                  <th className="py-2 pr-2 text-right">交通費</th>
                  <th className="py-2 pr-2 text-right">昼食補助</th>
                  <th className="py-2 pr-2 text-right">総支給額</th>
                  <th className="py-2 pr-2 text-right">源泉所得税</th>
                  <th className="py-2 text-right">差引支給額</th>
                  <th className="py-2 pl-2">税区分</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-2">{r.emp.employee_no}</td>
                    <td className="py-2 pr-2">{r.emp.name}</td>
                    <td className="py-2 pr-2 text-right">{r.work_days}</td>
                    <td className="py-2 pr-2 text-right">
                      {formatMinutes(r.total_minutes) || "0時間"}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.base_pay.toLocaleString()}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.transport_total.toLocaleString()}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.lunch_total.toLocaleString()}
                    </td>
                    <td className="py-2 pr-2 text-right font-medium">
                      {r.gross_pay.toLocaleString()}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.income_tax.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {r.net_pay.toLocaleString()}
                    </td>
                    <td className="py-2 pl-2">
                      {r.tax_category === "kou" ? "甲" : "乙"}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td colSpan={4} className="py-3 pr-2">
                    合計({rows.length}名)
                  </td>
                  <td className="py-3 pr-2 text-right">
                    {totals.base.toLocaleString()}
                  </td>
                  <td className="py-3 pr-2 text-right">
                    {totals.transport.toLocaleString()}
                  </td>
                  <td className="py-3 pr-2 text-right">
                    {totals.lunch.toLocaleString()}
                  </td>
                  <td className="py-3 pr-2 text-right">
                    {totals.gross.toLocaleString()}
                  </td>
                  <td className="py-3 pr-2 text-right">
                    {totals.tax.toLocaleString()}
                  </td>
                  <td className="py-3 text-right">
                    {totals.net.toLocaleString()}
                  </td>
                  <td className="py-3 pl-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-gray-600">
            単位: 円 / 源泉所得税は月額表(甲欄・乙欄)による / 本表は{" "}
            {new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}{" "}
            に出力
          </p>
        </section>
      )}
    </div>
  );
}
