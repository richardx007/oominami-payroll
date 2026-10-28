import Link from "next/link";
import type { Period } from "@/lib/period";
import type { EmployeePayroll } from "@/lib/payroll-data";
import type { PayslipIssuer } from "@/lib/payslip-issuer";
import type { Reimbursement, ReimbursementMap } from "@/lib/expense-reimbursement";
import { zebraRowClass } from "@/lib/table";
import { PayslipPdfButton } from "./payslip-pdf";
import { isDummyStatus } from "@/lib/employee-status";
import { DummyBadge } from "@/components/DummyBadge";

/** 分を「H:MM」表記にする(単位を省いて数字だけ・改行させない用) */
function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const NO_REIMBURSEMENT: Reimbursement = { total: 0, items: [] };

/**
 * 給与明細画面の明細一覧(総支給などの合計 + 従業員ごとの表)。
 * 締め画面(close/page.tsx)と、設定画面の税理士向けメールのテスト送信(添付PDFを作るため
 * 画面外に描画する。settings/ui.tsx)で共用する。サーバー専用の処理は持たないこと
 * (テスト送信ではブラウザ側で描画する)。
 *
 * - id: 「PDF」ボタン・税理士へのメール添付のキャプチャ対象。締め画面では "payslip-report"
 * - issuer: 従業員ごとの給与明細PDFボタンの支払元・印。渡さなければPDFボタンの列を出さない
 */
export function PayslipReport({
  id,
  period,
  status,
  payrolls,
  reimbursements,
  mismatchIds,
  issuer,
}: {
  id: string;
  period: Period;
  status: string;
  payrolls: EmployeePayroll[];
  reimbursements: ReimbursementMap;
  mismatchIds: Set<string>;
  issuer?: PayslipIssuer;
}) {
  // 締め前(status==="open")は退勤未入力の日を除外した暫定額(close/page.tsx 参照)
  const tentative = status === "open";
  const reimbursementOf = (employeeId: string) =>
    reimbursements.get(employeeId) ?? NO_REIMBURSEMENT;
  const anyReimbursement = payrolls.some(
    (p) => reimbursementOf(p.employee_id).total > 0
  );
  const anyMismatch = payrolls.some((p) => mismatchIds.has(p.employee_id));
  const showPdfCol = !!issuer;

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
  // ⚠️ 縞模様は「payrolls の添字」ではなく「実際に行が出る従業員の通し番号」で決める。
  // その期間に勤務実績が1日も無い従業員は wage_breakdown が空で**1行も描画されない**ため、
  // 添字で数えると飛ばされたぶん前後の行が同じ色になってしまう
  // (2026-09-11に発生。勤務0件の原田さんが岸田さんと鈴木さんの間にいた)。
  // 勤務が無くても立替精算がある従業員は出す(明細のPDF・お振込額を見せるため)
  const rendered = payrolls.filter(
    (p) =>
      !p.result ||
      p.result.wage_breakdown.length > 0 ||
      reimbursementOf(p.employee_id).total > 0
  );

  // ダミー従業員(テスト用)は行には出すが、合計には入れない
  const totals = payrolls.reduce(
    (acc, p) => {
      if (isDummyStatus(p.status)) return acc;
      if (p.result) {
        acc.gross += p.result.gross_pay;
        acc.tax += p.result.income_tax;
        acc.advance += p.result.advance_deduction;
        acc.net += p.result.net_pay;
      }
      acc.reimbursement += reimbursementOf(p.employee_id).total;
      return acc;
    },
    { gross: 0, tax: 0, advance: 0, net: 0, reimbursement: 0 }
  );

  return (
    <section
      id={id}
      // pdf-fit-content: PDF化のとき全列が収まる幅まで広げる(globals.css)
      className="pdf-fit-content rounded-xl border border-gray-200 bg-white"
    >
      <div className={`rounded-t-xl border-b p-4 ${bandClass}`}>
        <div>
          <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
            {status === "open" ? "給与計算プレビュー" : "確定明細"}
          </h2>
          {tentative && (
            <p className="mt-1 text-xs font-normal text-gray-500">
              ※ 退勤未入力の日(進行中の勤務など)は除外し、現時点の勤務実績で計算しています
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
            {totals.reimbursement > 0 && (
              <>
                <div className="flex items-baseline justify-between gap-4 font-normal text-gray-700">
                  <dt>立替精算(非課税)</dt>
                  <dd className="tabular-nums">
                    ¥{totals.reimbursement.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt>お振込額</dt>
                  <dd className="tabular-nums">
                    ¥{(totals.net + totals.reimbursement).toLocaleString()}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2 text-xs text-gray-500">
        {anyMismatch && (
          // pdf-hide: 予定との不一致は画面で確認するもの。PDF(ダウンロード・税理士への添付)には出さない
          <span className="pdf-hide text-amber-600">⚠️：勤務予定と不一致あり</span>
        )}
        <span className="ml-auto">*印は課税対象外</span>
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
              <th className="px-4 py-2 text-right">交通費*</th>
              <th className="px-4 py-2 text-right">昼食補助</th>
              <th className="px-4 py-2 text-right">総支給</th>
              <th className="px-4 py-2 text-right">課税対象額</th>
              <th className="px-4 py-2 text-right">所得税</th>
              <th className="px-4 py-2 text-right">前払金</th>
              <th className="px-4 py-2 text-right">差引支給</th>
              {/* 立替の給与精算(経費管理で確認済みの立替)。列は立替がある月だけ出す */}
              {anyReimbursement && (
                <>
                  <th className="px-4 py-2 text-right">立替精算*</th>
                  <th className="px-4 py-2 text-right">お振込額</th>
                </>
              )}
              {/* 従業員ごとの給与明細PDF出力ボタンの列(見出しは不要)。
                  pdf-col は一覧のPDF出力時にこの列を隠すための目印(globals.css) */}
              {showPdfCol && (
                <th className="pdf-col px-4 py-2 text-right">
                  <span className="sr-only">PDF出力</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rendered.flatMap((p, pIndex) => {
              const result = p.result;
              // 縞は「行」ではなく「従業員」単位。時給分割で複数行になる人も同じ色にする
              const zebra = zebraRowClass(pIndex);
              if (!result) {
                return (
                  <tr
                    key={p.employee_id}
                    className={`border-b border-gray-50 ${zebra}`}
                  >
                    {/* 固定列は bg-inherit で行の縞の色を引き継ぐ(lib/table.ts 参照) */}
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-4 py-3 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]">
                      {p.name}
                      {isDummyStatus(p.status) && <DummyBadge />}
                    </td>
                    <td
                      colSpan={(anyReimbursement ? 17 : 15) + (showPdfCol ? 1 : 0)}
                      className="px-4 py-3 text-red-600"
                    >
                      {p.error}
                    </td>
                  </tr>
                );
              }
              // 月度途中で時給が変わった場合、時給ごとに明細行を分ける。
              // 時給に依存しない列(交通費・昼食補助・総支給・課税対象額・所得税・前払金・差引支給)は
              // 分割できないので rowSpan で人単位1つにまとめる
              // 勤務が無く立替精算だけの従業員も1行出す(勤務の列は0)
              const breakdown =
                result.wage_breakdown.length > 0
                  ? result.wage_breakdown
                  : [
                      {
                        work_days: 0,
                        total_minutes: 0,
                        night_minutes: 0,
                        overtime_minutes: 0,
                        hourly_wage: 0,
                        base_pay: 0,
                        night_pay: 0,
                        overtime_pay: 0,
                      },
                    ];
              const rowSpan = breakdown.length;
              return breakdown.map((b, i) => (
                <tr
                  key={`${p.employee_id}-${i}`}
                  className={`border-b border-gray-50 ${zebra}`}
                >
                  {i === 0 && (
                    <td
                      rowSpan={rowSpan}
                      // 縦位置は align を付けず既定(中央)のまま。他の列と揃える
                      // (2026-09-11。「未確定」の注記で2行になる場合も中央でよい)
                      // 固定列は bg-inherit で行の縞の色を引き継ぐ(lib/table.ts 参照)
                      className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-4 py-3 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]"
                    >
                      {p.name}
                      {isDummyStatus(p.status) && <DummyBadge />}
                      {/* 仮計算で除外した日を氏名の下に小さく注記(退勤未入力=進行中の勤務など) */}
                      {tentative && result.excluded_dates.length > 0 && (
                        <span className="mt-0.5 block text-xs font-normal text-amber-600">
                          {result.excluded_dates
                            .map((d) => d.slice(5).replace("-", "/"))
                            .join("・")}
                          は未確定
                        </span>
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {b.work_days}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {/* シフト予定と時刻が食い違う日がある従業員は勤務時間の左に⚠️。
                        タップで勤務表(該当従業員を選択)へ飛び、どの日が不一致か確認できる。 */}
                    {i === 0 && mismatchIds.has(p.employee_id) && (
                      <Link
                        href={`/admin/timesheet?e=${p.employee_id}&p=${period.key}`}
                        title="勤務予定と実績が一致しない日があります。タップして勤務表で確認"
                        aria-label="勤務予定と不一致あり。勤務表で確認"
                        className="pdf-hide mr-1 align-middle"
                      >
                        ⚠️
                      </Link>
                    )}
                    {hhmm(b.total_minutes)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {b.night_minutes > 0 ? hhmm(b.night_minutes) : "―"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {b.overtime_minutes > 0 ? hhmm(b.overtime_minutes) : "―"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    ¥{b.hourly_wage.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ¥{b.base_pay.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ¥{b.night_pay.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ¥{b.overtime_pay.toLocaleString()}
                  </td>
                  {i === 0 && (
                    <>
                      {/* ここから右は rowSpan で人単位にまとめる列。
                          縦位置は align を付けず既定(中央)のままにして、左隣の
                          日数〜残業手当の列と揃える(2026-09-11。PDFボタンで行が
                          少し高くなり、align-top だと上にずれて見えたため) */}
                      <td rowSpan={rowSpan} className="px-4 py-3 text-right">
                        ¥{result.transport_total.toLocaleString()}
                      </td>
                      <td rowSpan={rowSpan} className="px-4 py-3 text-right">
                        ¥{result.lunch_total.toLocaleString()}
                      </td>
                      <td
                        rowSpan={rowSpan}
                        className="px-4 py-3 text-right font-medium"
                      >
                        ¥{result.gross_pay.toLocaleString()}
                      </td>
                      {/* 交通費を除いた課税対象額。税額表と突き合わせて検算するための列(2026-08-21追加) */}
                      <td
                        rowSpan={rowSpan}
                        className="whitespace-nowrap px-4 py-3 text-right text-gray-600"
                      >
                        ¥{result.taxable_amount.toLocaleString()}
                      </td>
                      <td
                        rowSpan={rowSpan}
                        className="whitespace-nowrap px-4 py-3 text-right text-red-600"
                      >
                        −¥{result.income_tax.toLocaleString()}
                      </td>
                      {/* 日当として先に現金で支払った分。差引支給からのみ控除する */}
                      <td
                        rowSpan={rowSpan}
                        className="whitespace-nowrap px-4 py-3 text-right text-red-600"
                      >
                        {result.advance_deduction > 0
                          ? `−¥${result.advance_deduction.toLocaleString()}`
                          : "―"}
                      </td>
                      <td
                        rowSpan={rowSpan}
                        className="px-4 py-3 text-right font-bold"
                      >
                        ¥{result.net_pay.toLocaleString()}
                      </td>
                      {anyReimbursement && (
                        <>
                          <td
                            rowSpan={rowSpan}
                            className="whitespace-nowrap px-4 py-3 text-right"
                          >
                            {reimbursementOf(p.employee_id).total > 0
                              ? `¥${reimbursementOf(p.employee_id).total.toLocaleString()}`
                              : "―"}
                          </td>
                          <td
                            rowSpan={rowSpan}
                            className="whitespace-nowrap px-4 py-3 text-right font-bold"
                          >
                            ¥{(
                              result.net_pay +
                              reimbursementOf(p.employee_id).total
                            ).toLocaleString()}
                          </td>
                        </>
                      )}
                      {/* 右端: この従業員だけの給与明細をA4縦のPDFで出力する */}
                      {issuer && (
                        <td
                          rowSpan={rowSpan}
                          className="pdf-col whitespace-nowrap px-4 py-3 text-right"
                        >
                          <PayslipPdfButton
                            issuer={issuer}
                            data={{
                              name: p.name,
                              periodLabel: period.label,
                              periodKey: period.key,
                              start: period.start,
                              end: period.end,
                              paymentDate: period.paymentDate,
                              draft,
                              result,
                              reimbursement: reimbursementOf(p.employee_id),
                            }}
                          />
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ));
            })}
            {rendered.length === 0 && (
              <tr>
                <td
                  colSpan={(anyReimbursement ? 18 : 16) + (showPdfCol ? 1 : 0)}
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
  );
}
