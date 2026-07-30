import Link from "next/link";
import { WEEKDAYS, adjacentPeriodKey, weekdayOf, type Period } from "@/lib/period";
import type { DailyReport } from "@/lib/daily-report";
import { AdvanceToggle, DailySummary } from "./ui";

/** 分を「H:MM」表記にする */
function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

/**
 * 日別実績の画面本体(管理者・従業員で共用)。
 * `editable=false` のときは前払金の記録/取消ボタンを出さず、金額の表示のみにする
 * (従業員は自分の実績を確認するだけで記録操作はできない)。
 */
export function DailyReportView({
  period,
  report,
  basePath,
  title,
  descriptionLines,
  editable,
}: {
  period: Period;
  report: DailyReport;
  basePath: string;
  title: string;
  descriptionLines: [string, string];
  editable: boolean;
}) {
  const from = report.from;
  const to = report.to;

  const grand = report.employees.reduce(
    (acc, e) => ({
      days: acc.days + e.totals.days,
      workMinutes: acc.workMinutes + e.totals.workMinutes,
      total: acc.total + e.totals.total,
      advance: acc.advance + e.totals.advance,
    }),
    { days: 0, workMinutes: 0, total: 0, advance: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* 前月/翌月は給与明細画面と同じ ＜ 年月 ＞ のスタイル・配色に統一 */}
        <div className="flex items-center gap-1.5">
          <Link
            href={`${basePath}?p=${adjacentPeriodKey(period.key, -1)}`}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </Link>
          <span className="text-lg font-extrabold tracking-tight text-blue-800">
            {period.label}
          </span>
          <Link
            href={`${basePath}?p=${adjacentPeriodKey(period.key, 1)}`}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </Link>
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>

      <ul className="space-y-1 text-sm text-gray-500">
        <li>・{descriptionLines[0]}</li>
        <li>・{descriptionLines[1]}</li>
      </ul>

      {report.employees.length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          対象期間に勤務データがありません
        </p>
      )}

      {report.employees.length > 0 && (
        <DailySummary
          from={from}
          to={to}
          days={grand.days}
          workMinutes={grand.workMinutes}
          total={grand.total}
          advance={grand.advance}
        />
      )}

      {report.employees.map((emp) => (
        <section
          key={emp.employeeId}
          className="rounded-xl border border-gray-200 bg-white"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border-b border-result-200 bg-result-50 p-4">
            {/* 画面上の従業員表示は原則ニックネーム優先(未設定なら氏名)。
                CSVは帳票のため従来どおり氏名を出力する。 */}
            <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
              {emp.nickname?.trim() || emp.name}
            </h2>
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {emp.totals.days}日
            </p>
          </div>
          <div className="overflow-x-auto print-report">
            <table className="w-full text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-result-200 bg-result-100 text-left text-xs font-semibold text-gray-700">
                  <th className="sticky left-0 z-10 bg-result-100 px-3 py-2 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]">
                    日付
                  </th>
                  {/* 支給額・前払金は横スクロールせずに支払状況を確認できるよう日付の直後に置く */}
                  <th className="px-3 py-2 text-right">支給額</th>
                  <th className="px-3 py-2 text-right">前払金</th>
                  <th className="px-3 py-2 text-left">メモ</th>
                  <th className="px-3 py-2 text-right">出勤</th>
                  <th className="px-3 py-2 text-right">退勤</th>
                  <th className="px-3 py-2 text-right">休憩</th>
                  <th className="px-3 py-2 text-right">実働</th>
                  <th className="px-3 py-2 text-right">深夜</th>
                  <th className="px-3 py-2 text-right">残業</th>
                  <th className="px-3 py-2 text-right">時給</th>
                  <th className="px-3 py-2 text-right">基本給</th>
                  <th className="px-3 py-2 text-right">深夜手当</th>
                  <th className="px-3 py-2 text-right">残業手当</th>
                  <th className="px-3 py-2 text-right">昼食補助</th>
                  <th className="px-3 py-2 text-right">交通費</th>
                </tr>
              </thead>
              <tbody>
                {emp.rows.map((r) => {
                  const wd = weekdayOf(r.workDate);
                  return (
                    <tr
                      key={r.workDate}
                      className="whitespace-nowrap border-b border-gray-100 tabular-nums"
                    >
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)] ${
                          wd === 0
                            ? "text-red-600"
                            : wd === 6
                              ? "text-blue-600"
                              : "text-gray-900"
                        }`}
                      >
                        {r.workDate.slice(5).replace("-", "/")}(
                        {WEEKDAYS[wd]})
                      </th>
                      {r.error ? (
                        <>
                          <td className="px-3 py-2 text-right text-gray-400">
                            ―
                          </td>
                          {/* 金額が確定できない日は前払金を記録させない */}
                          <td className="px-3 py-2 text-right">
                            {editable ? (
                              <AdvanceToggle
                                employeeId={emp.employeeId}
                                workDate={r.workDate}
                                amount={0}
                                recorded={r.advance}
                                disabled
                              />
                            ) : (
                              <AdvanceAmount recorded={r.advance} />
                            )}
                          </td>
                          <td className="whitespace-normal break-words px-3 py-2 text-left text-red-600">
                            {r.note}
                          </td>
                          <td
                            colSpan={12}
                            className="px-3 py-2 text-left text-red-600"
                          >
                            {r.startTime}
                            {r.endTime ? `〜${r.endTime}` : "〜"} — {r.error}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right font-bold">
                            {yen(r.total)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editable ? (
                              <AdvanceToggle
                                employeeId={emp.employeeId}
                                workDate={r.workDate}
                                amount={r.total}
                                recorded={r.advance}
                              />
                            ) : (
                              <AdvanceAmount recorded={r.advance} />
                            )}
                          </td>
                          <td className="whitespace-normal break-words px-3 py-2 text-left text-red-600">
                            {r.note}
                          </td>
                          <td className="px-3 py-2 text-right">{r.startTime}</td>
                          <td className="px-3 py-2 text-right">{r.endTime}</td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {hhmm(r.breakMinutes)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {hhmm(r.workMinutes)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {hhmm(r.nightMinutes)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              r.overtimeMinutes > 0
                                ? "font-bold text-blue-700"
                                : "text-gray-500"
                            }`}
                          >
                            {hhmm(r.overtimeMinutes)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {yen(r.hourlyWage)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {yen(r.basePay)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {yen(r.nightPay)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              r.overtimePay > 0 ? "font-bold text-blue-700" : ""
                            }`}
                          >
                            {yen(r.overtimePay)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {yen(r.lunch)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {yen(r.transport)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                <tr className="whitespace-nowrap bg-gray-200 font-bold tabular-nums">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-gray-200 px-3 py-2 text-left shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]"
                  >
                    小計
                  </th>
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.total)}
                  </td>
                  <td className="px-3 py-2 text-right text-amber-700">
                    {yen(emp.totals.advance)}
                  </td>
                  <td className="px-3 py-2" />
                  {/* 出勤・退勤・休憩は合計しない */}
                  <td className="px-3 py-2" colSpan={3} />
                  <td className="px-3 py-2 text-right">
                    {hhmm(emp.totals.workMinutes)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {hhmm(emp.totals.nightMinutes)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      emp.totals.overtimeMinutes > 0 ? "text-blue-700" : ""
                    }`}
                  >
                    {hhmm(emp.totals.overtimeMinutes)}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.basePay)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.nightPay)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      emp.totals.overtimePay > 0 ? "text-blue-700" : ""
                    }`}
                  >
                    {yen(emp.totals.overtimePay)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.lunch)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.transport)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

/** 従業員側の読み取り専用表示(前払済みならその金額のみ表示・未記録は何も出さない) */
function AdvanceAmount({ recorded }: { recorded: number | null }) {
  if (recorded === null) return null;
  return (
    <span className="font-medium text-amber-700 tabular-nums">
      ¥{recorded.toLocaleString()}
    </span>
  );
}
