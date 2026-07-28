import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadDailyReport } from "@/lib/daily-report";
import {
  WEEKDAYS,
  adjacentPeriodKey,
  currentPeriod,
  periodFromKey,
  weekdayOf,
} from "@/lib/period";
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
 * 日当設定: 給与期間(前月26日〜当月25日)ごとの「従業員 × 日ごと」の勤務時間・支給額一覧。
 * 日当を現金で手渡すときに、その日いくら渡せばよいかを確認するために使う
 * (計算方法は月次の給与計算と同じ)。渡した分は各行から「前払金」として
 * 記録でき、その勤務日を含む給与期間の差引支給額から控除される。
 */
export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireAdmin();
  const { p } = await searchParams;
  // 期間の指定方法は給与明細画面と揃える(月度単位・前月/翌月で移動)
  const period = (p && periodFromKey(p)) || currentPeriod();
  const from = period.start;
  const to = period.end;

  const report = await loadDailyReport(from, to);

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
            href={`/admin/daily?p=${adjacentPeriodKey(period.key, -1)}`}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </Link>
          <span className="text-lg font-extrabold tracking-tight text-blue-800">
            {period.label}
          </span>
          <Link
            href={`/admin/daily?p=${adjacentPeriodKey(period.key, 1)}`}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </Link>
        </div>
        <h1 className="text-xl font-bold">日当設定</h1>
      </div>

      <ul className="space-y-1 text-sm text-gray-500">
        <li>・日別の支給額が確認できます。（源泉徴収は月給時にまとめます。）</li>
        <li>
          ・日当の前払いをした場合は「前払済」ボタンを押してください。月末の支給額からは除外されます。
        </li>
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
              {emp.totals.days}日 / {hhmm(emp.totals.workMinutes)} /{" "}
              {yen(emp.totals.total)}
              {emp.totals.advance > 0 && (
                <span className="ml-2 font-medium text-amber-700">
                  (前払 {yen(emp.totals.advance)})
                </span>
              )}
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
                            <AdvanceToggle
                              employeeId={emp.employeeId}
                              workDate={r.workDate}
                              amount={0}
                              recorded={r.advance}
                              disabled
                            />
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
                            <AdvanceToggle
                              employeeId={emp.employeeId}
                              workDate={r.workDate}
                              amount={r.total}
                              recorded={r.advance}
                            />
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
                          <td className="px-3 py-2 text-right text-gray-500">
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
                          <td className="px-3 py-2 text-right">
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
                <tr className="whitespace-nowrap bg-gray-50 font-bold tabular-nums">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]"
                  >
                    小計
                  </th>
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.total)}
                  </td>
                  <td className="px-3 py-2 text-right text-amber-700">
                    {yen(emp.totals.advance)}
                  </td>
                  {/* 出勤・退勤・休憩は合計しない */}
                  <td className="px-3 py-2" colSpan={3} />
                  <td className="px-3 py-2 text-right">
                    {hhmm(emp.totals.workMinutes)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {hhmm(emp.totals.nightMinutes)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {hhmm(emp.totals.overtimeMinutes)}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.basePay)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.nightPay)}
                  </td>
                  <td className="px-3 py-2 text-right">
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
