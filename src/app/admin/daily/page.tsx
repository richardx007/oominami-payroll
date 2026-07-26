import { requireAdmin } from "@/lib/auth";
import { loadDailyReport } from "@/lib/daily-report";
import { WEEKDAYS, todayJST, weekdayOf } from "@/lib/period";
import { getPayrollStartDate } from "@/lib/payroll-start";
import { DownloadDailyCsvButton, PrintButton } from "./ui";

/** 分を「H:MM」表記にする */
function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

function isDate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** その月の1日("YYYY-MM-01") */
function firstOfMonth(date: string) {
  return date.slice(0, 8) + "01";
}

/**
 * 日当レポート: 任意期間の「従業員 × 日ごと」の勤務時間・支給額一覧。
 * 給与計算の運用開始日より前の勤務分など、月次給与の外で現金精算する分の
 * 金額を確認するために使う(計算方法は月次の給与計算と同じ)。
 */
export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const { from: qFrom, to: qTo } = await searchParams;

  const today = todayJST();
  const from = isDate(qFrom) ? qFrom : firstOfMonth(today);
  const to = isDate(qTo) ? qTo : today;
  const invalidRange = from > to;

  const [report, payrollStart] = await Promise.all([
    invalidRange
      ? Promise.resolve({ from, to, employees: [] })
      : loadDailyReport(from, to),
    getPayrollStartDate(),
  ]);

  const grand = report.employees.reduce(
    (acc, e) => ({
      days: acc.days + e.totals.days,
      workMinutes: acc.workMinutes + e.totals.workMinutes,
      total: acc.total + e.totals.total,
    }),
    { days: 0, workMinutes: 0, total: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">日当</h1>
          <p className="mt-1 text-sm text-gray-500">
            期間を指定して、従業員ごとの日別の勤務時間と支給額を表示します。
            金額の計算方法(休憩・深夜手当・残業手当・昼食補助)は月次の給与計算と同じです。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <DownloadDailyCsvButton from={from} to={to} />
          <PrintButton />
        </div>
      </div>

      {/* 期間指定。iOS の日付ピッカーは指定幅より広く描画されるため幅を固定して縮ませない */}
      <form
        method="get"
        className="flex flex-wrap items-center gap-2 print:hidden"
      >
        <input
          type="date"
          name="from"
          aria-label="開始日"
          defaultValue={from}
          className="w-40 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-400">〜</span>
        <input
          type="date"
          name="to"
          aria-label="終了日"
          defaultValue={to}
          className="w-40 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button className="shrink-0 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
          表示
        </button>
      </form>

      {payrollStart && (
        <p className="text-sm text-gray-500">
          給与計算の運用開始日は {payrollStart.replaceAll("-", "/")} です。
          これより前の勤務は月次の給与計算に含まれないため、この画面の金額で精算してください。
        </p>
      )}

      {invalidRange && (
        <p className="text-sm font-medium text-red-600">
          開始日は終了日以前にしてください
        </p>
      )}

      {!invalidRange && report.employees.length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          対象期間に勤務データがありません
        </p>
      )}

      {report.employees.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <dl className="max-w-xs space-y-1 text-sm font-semibold text-gray-900">
            <div className="flex items-baseline justify-between gap-4">
              <dt>対象期間</dt>
              <dd className="tabular-nums">
                {from.replaceAll("-", "/")}〜{to.replaceAll("-", "/")}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>のべ勤務日数</dt>
              <dd className="tabular-nums">{grand.days}日</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>合計勤務時間</dt>
              <dd className="tabular-nums">{hhmm(grand.workMinutes)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>支給額合計</dt>
              <dd className="tabular-nums">{yen(grand.total)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-gray-500">
            源泉所得税は月額表による月単位の計算のため、この画面の金額には含まれていません
            (日当として支払う場合の源泉徴収の扱いは税理士の指示に従ってください)。
          </p>
        </div>
      )}

      {report.employees.map((emp) => (
        <section
          key={emp.employeeId}
          className="rounded-xl border border-gray-200 bg-white"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border-b border-blue-100 bg-blue-50/70 p-4">
            <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
              {emp.name}
              {emp.nickname?.trim() && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({emp.nickname.trim()})
                </span>
              )}
            </h2>
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {emp.totals.days}日 / {hhmm(emp.totals.workMinutes)} /{" "}
              {yen(emp.totals.total)}
            </p>
          </div>
          <div className="overflow-x-auto print-report">
            <table className="w-full text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-blue-200 bg-blue-100 text-left text-xs font-semibold text-gray-700">
                  <th className="sticky left-0 z-10 bg-blue-100 px-3 py-2 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.15)]">
                    日付
                  </th>
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
                  <th className="px-3 py-2 text-right">支給額</th>
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
                        <td
                          colSpan={13}
                          className="px-3 py-2 text-left text-red-600"
                        >
                          {r.startTime}
                          {r.endTime ? `〜${r.endTime}` : "〜"} — {r.error}
                        </td>
                      ) : (
                        <>
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
                          <td className="px-3 py-2 text-right font-bold">
                            {yen(r.total)}
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
                  <td className="px-3 py-2 text-right">
                    {yen(emp.totals.total)}
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
