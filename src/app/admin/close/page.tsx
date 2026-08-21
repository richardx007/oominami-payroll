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
  searchParams: Promise<{ p?: string; tentative?: string }>;
}) {
  await requireAdmin();
  const { p, tentative: tentativeParam } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("status")
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .maybeSingle();

  const status = payPeriod?.status ?? "open";
  // 「税額仮計算」は締め前(status==="open")のみ有効。締め済み・支払済みの期間は
  // 確定済みの数字を見せるべきなので、クエリパラメータが付いていても無視する。
  const tentative = status === "open" && tentativeParam === "1";
  const payrolls = await calculatePeriodPayroll(period, {
    ignoreIncomplete: tentative,
  });
  // 未締め(=金額が未確定)は表をイエロー系にする。
  // 配色の意味づけは「確定=グリーン系 / 未確定=イエロー系 / それ以外=ブルー系」で統一しており、
  // イエローはシフト表の「調整中」モード(bg-yellow-200)と同じ色に揃えている。
  const draft = status === "open";
  const bandClass = draft
    ? "border-yellow-300 bg-yellow-50"
    : "border-result-200 bg-result-50";
  const headRowClass = draft
    ? "border-yellow-300 bg-yellow-200"
    : "border-result-200 bg-result-100";
  const headCellClass = draft ? "bg-yellow-200" : "bg-result-100";
  const totals = payrolls.reduce(
    (acc, p) => {
      if (p.result) {
        acc.gross += p.result.gross_pay;
        acc.tax += p.result.income_tax;
        acc.advance += p.result.advance_deduction;
        acc.net += p.result.net_pay;
      }
      return acc;
    },
    { gross: 0, tax: 0, advance: 0, net: 0 }
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
                className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
              >
                ＜
              </Link>
              <span className="text-lg font-extrabold tracking-tight text-blue-800">
                {period.label}
              </span>
              <Link
                href={`/admin/close?p=${adjacentPeriodKey(period.key, 1)}`}
                aria-label="翌月"
                className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
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

        <div className="flex flex-wrap items-center gap-2">
          {/* 締め前のみ: 退勤未入力(進行中の勤務)を除外して税額を仮に確認できるトグル。
              締め本体(closePeriod)は従来どおり退勤未入力があれば止まる(このトグルは表示切替のみ)。 */}
          {status === "open" && (
            <Link
              href={`/admin/close?p=${period.key}${tentative ? "" : "&tentative=1"}`}
              aria-pressed={tentative}
              title="退勤未入力(進行中の勤務など)を除外して、税額を仮に計算します"
              className={`inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium print:hidden ${
                tentative
                  ? "border-gray-400 bg-gray-200 text-gray-800"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              税額仮計算{tentative ? " ✓" : ""}
            </Link>
          )}
          {/* 操作ボタンはヘッダ部分に配置(締め/支払・明細配信・締め解除・税理士資料操作) */}
          <CloseActions periodKey={period.key} status={status} />
        </div>
      </div>

      {/* id は PDFダウンロード(DownloadPdfButton)のキャプチャ対象。変更する場合は
          admin/close/ui.tsx の targetId も合わせること */}
      <section
        id="payslip-report"
        className="rounded-xl border border-gray-200 bg-white"
      >
        <div className={`rounded-t-xl border-b p-4 ${bandClass}`}>
          <div>
            <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
              {tentative
                ? "税額仮計算"
                : status === "open"
                  ? "給与計算プレビュー"
                  : "確定明細"}
            </h2>
            {tentative && (
              <p className="mt-1 text-xs font-normal text-amber-700">
                退勤未入力の日(進行中の勤務など)は除外して計算した仮の金額です。確定額ではありません。
              </p>
            )}
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
              {totals.advance > 0 && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt>前払金控除</dt>
                  <dd className="tabular-nums">
                    ¥{totals.advance.toLocaleString()}
                  </dd>
                </div>
              )}
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
              <tr
                className={`whitespace-nowrap border-b text-left text-xs font-semibold text-gray-700 ${headRowClass}`}
              >
                <th
                  className={`sticky left-0 z-10 px-4 py-2 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)] ${headCellClass}`}
                >
                  氏名
                </th>
                <th className="px-4 py-2 text-right">日数</th>
                <th className="px-4 py-2 text-right">勤務時間</th>
                <th className="px-4 py-2 text-right">うち深夜</th>
                <th className="px-4 py-2 text-right">うち残業</th>
                <th className="px-4 py-2 text-right">基本時給</th>
                <th className="px-4 py-2 text-right">基本給</th>
                <th className="px-4 py-2 text-right">深夜手当</th>
                <th className="px-4 py-2 text-right">残業手当</th>
                <th className="px-4 py-2 text-right">交通費</th>
                <th className="px-4 py-2 text-right">昼食補助</th>
                <th className="px-4 py-2 text-right">総支給</th>
                <th className="px-4 py-2 text-right">所得税</th>
                <th className="px-4 py-2 text-right">前払金</th>
                <th className="px-4 py-2 text-right">差引支給</th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map((p) => (
                <tr key={p.employee_id} className="border-b border-gray-50">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]">
                    {p.name}
                    {/* 仮計算で除外した日を氏名の下に小さく注記(退勤未入力=進行中の勤務など) */}
                    {tentative && p.result && p.result.excluded_dates.length > 0 && (
                      <span className="mt-0.5 block text-xs font-normal text-amber-600">
                        {p.result.excluded_dates
                          .map((d) => d.slice(5).replace("-", "/"))
                          .join("・")}
                        は退勤未入力のため除外
                      </span>
                    )}
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
                        {p.result.overtime_minutes > 0
                          ? hhmm(p.result.overtime_minutes)
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
                        ¥{p.result.overtime_pay.toLocaleString()}
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
                      {/* 日当として先に現金で支払った分。差引支給からのみ控除する */}
                      <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">
                        {p.result.advance_deduction > 0
                          ? `−¥${p.result.advance_deduction.toLocaleString()}`
                          : "―"}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        ¥{p.result.net_pay.toLocaleString()}
                      </td>
                    </>
                  ) : (
                    <td colSpan={14} className="px-4 py-3 text-red-600">
                      {p.error}
                    </td>
                  )}
                </tr>
              ))}
              {payrolls.length === 0 && (
                <tr>
                  <td
                    colSpan={15}
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
