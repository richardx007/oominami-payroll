import Link from "next/link";
import { WEEKDAYS, adjacentPeriodKey, weekdayOf, type Period } from "@/lib/period";
import type { DailyReport } from "@/lib/daily-report";
import {
  AdvanceToggle,
  DailySummary,
  DownloadDailyCsvButton,
  LunchReasonBadge,
} from "./ui";
import { DownloadPdfButton } from "@/app/admin/report/ui";

/**
 * 分を「H:MM」表記にする。**0 は空白**にして、値のある行だけが目に入るようにする。
 * ※ 出勤・退勤の「時刻」には使わないこと(深夜0時ちょうどの "0:00" が消えてしまうため。
 *    時刻は DB の値をそのまま出す)。ここで空白にするのは休憩・実働・深夜・残業の「時間数」。
 */
function hhmm(minutes: number) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** 金額。**0 は空白**にする(上記と同じ理由) */
function yen(n: number) {
  if (!n) return "";
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
  includeRetired,
}: {
  period: Period;
  report: DailyReport;
  basePath: string;
  title: string;
  descriptionLines: [string, string];
  editable: boolean;
  /** 退職者(仮の退職者複製を含む)を一覧に含めるか。既定オフ(2026-08-20) */
  includeRetired: boolean;
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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{title}</h1>
          {/* PDF/CSVは管理者のみ(従業員の閲覧専用画面では出さない)。
              スマホ(特にiOSのPWA)では window.print() が動かないため、印刷ではなくPDFダウンロード */}
          {editable && (
            <>
              <Link
                href={`${basePath}?p=${period.key}${includeRetired ? "" : "&retired=1"}`}
                aria-pressed={includeRetired}
                title="退職者(仮の退職者複製を含む)を一覧に含めるか切り替えます"
                className={`inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium ${
                  includeRetired
                    ? "border-gray-400 bg-gray-200 text-gray-800"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                退職者を含む{includeRetired ? " ✓" : ""}
              </Link>
              <DownloadPdfButton
                targetId="daily-report"
                filename={`日別実績_${period.key}.pdf`}
                sectionSelector=".pdf-section"
              />
              <DownloadDailyCsvButton from={from} to={to} includeRetired={includeRetired} />
            </>
          )}
        </div>
      </div>

      <ul className="space-y-1 text-sm text-gray-500">
        <li>・{descriptionLines[0]}</li>
        <li>・{descriptionLines[1]}</li>
      </ul>

      {/* id は PDFダウンロード(DownloadPdfButton)のキャプチャ対象。変更する場合は
          admin/daily/page.tsx の targetId も合わせること */}
      <div id="daily-report" className="space-y-6">
      {/* 勤務実績と紐付かない前払金。表には出ないのに給与計算では控除され続けるため、
          気付けるよう警告として出す(打刻の修正で勤務日がずれた場合などに発生する)。
          対処できるのは管理者だけなので従業員の画面(editable=false)には出さない */}
      {editable && report.orphanAdvances.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm">
          <p className="font-bold text-red-800">
            勤務実績と結びついていない前払金があります
          </p>
          <p className="mt-1 text-red-700">
            下記は勤務実績が無い日に記録されている前払金です。表には出ませんが
            <span className="font-semibold">給与計算では差引支給額から控除されます</span>。
            勤務日の記録漏れ・打刻修正で日付がずれた場合などに発生します。内容を確認し、
            正しい勤務日で記録し直すか、記録を取り消してください。
          </p>
          <ul className="mt-2 space-y-1">
            {report.orphanAdvances.map((a) => (
              <li
                key={`${a.employeeId}_${a.workDate}`}
                className="tabular-nums text-red-900"
              >
                ・{a.workDate.replaceAll("-", "/")}
                {a.nickname?.trim() || a.name}　¥
                {a.amount.toLocaleString()}
                {a.note ? `（${a.note}）` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

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
        // pdf-section: PDFダウンロード時、この要素の途中で改ページしないようにする
        // 目印(DownloadPdfButton の sectionSelector と対応。片方だけ変更しないこと)
        <section
          key={emp.employeeId}
          className="pdf-section rounded-xl border border-gray-200 bg-white"
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
                            {r.lunchOverridden && (
                              <LunchReasonBadge
                                reasonType={r.lunchReasonType}
                                reasonNote={r.lunchReasonNote}
                              />
                            )}
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
