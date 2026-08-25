import type { PayRow } from "./actions";

/** 分を「H:MM」表記にする(PDF用) */
function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const th = "border border-gray-300 bg-gray-100 px-2 py-1 text-right font-semibold whitespace-nowrap";
const thName = "border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold whitespace-nowrap";
const td = "border border-gray-300 px-2 py-1 text-right whitespace-nowrap";
const tdName = "border border-gray-300 px-2 py-1 text-left whitespace-nowrap";

/**
 * 税理士向けメールに添付するPDFの中身(常に画面外に配置する前提のコンポーネント)。
 * `lib/pdf-capture.ts` の html2canvas+jsPDF でそのままキャプチャする。
 * CSV(buildCsv)と同じ列構成にしている(添付ファイル間で内容が食い違わないように)。
 */
export function PdfReportTable({
  id,
  periodLabel,
  companyName,
  rows: allRows,
}: {
  id: string;
  periodLabel: string;
  companyName: string;
  rows: PayRow[];
}) {
  // 総支給額が0の人は出力対象外(給与明細画面には表示したまま)
  const rows = allRows.filter((r) => r.gross_pay !== 0);
  const totals = rows.reduce(
    (acc, r) => ({
      workDays: acc.workDays + r.work_days,
      totalMinutes: acc.totalMinutes + r.total_minutes,
      nightMinutes: acc.nightMinutes + r.night_minutes,
      overtimeMinutes: acc.overtimeMinutes + r.overtime_minutes,
      basePay: acc.basePay + r.base_pay,
      nightPay: acc.nightPay + r.night_pay,
      overtimePay: acc.overtimePay + r.overtime_pay,
      transport: acc.transport + r.transport_total,
      lunch: acc.lunch + r.lunch_total,
      gross: acc.gross + r.gross_pay,
      tax: acc.tax + r.income_tax,
      advance: acc.advance + r.advance_deduction,
      net: acc.net + r.net_pay,
    }),
    {
      workDays: 0,
      totalMinutes: 0,
      nightMinutes: 0,
      overtimeMinutes: 0,
      basePay: 0,
      nightPay: 0,
      overtimePay: 0,
      transport: 0,
      lunch: 0,
      gross: 0,
      tax: 0,
      advance: 0,
      net: 0,
    }
  );
  const yen = (n: number) => `¥${n.toLocaleString()}`;

  return (
    <div
      id={id}
      style={{ position: "fixed", top: 0, left: "-10000px", width: "1400px" }}
      className="bg-white p-6 text-gray-900"
    >
      <h1 className="text-lg font-bold">{periodLabel} 給与支給一覧</h1>
      <p className="mt-1 text-xs text-gray-500">{companyName}</p>
      <p className="mt-2 text-right text-xs text-gray-500">*印は課税対象外</p>
      <table className="mt-1 w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={thName}>従業員No</th>
            <th className={thName}>氏名</th>
            <th className={th}>勤務日数</th>
            <th className={th}>勤務時間</th>
            <th className={th}>うち深夜</th>
            <th className={th}>うち残業</th>
            <th className={th}>基本時給</th>
            <th className={th}>基本給</th>
            <th className={th}>深夜勤務手当</th>
            <th className={th}>残業手当</th>
            <th className={th}>交通費*</th>
            <th className={th}>昼食補助</th>
            <th className={th}>総支給額</th>
            <th className={th}>源泉所得税</th>
            <th className={th}>前払金控除</th>
            <th className={th}>差引支給額</th>
            <th className={th}>税区分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.emp.employee_no}>
              <td className={tdName}>{r.emp.employee_no}</td>
              <td className={tdName}>{r.emp.name}</td>
              <td className={td}>{r.work_days}</td>
              <td className={td}>{hhmm(r.total_minutes)}</td>
              <td className={td}>{hhmm(r.night_minutes)}</td>
              <td className={td}>{hhmm(r.overtime_minutes)}</td>
              <td className={td}>{yen(r.hourly_wage)}</td>
              <td className={td}>{yen(r.base_pay)}</td>
              <td className={td}>{yen(r.night_pay)}</td>
              <td className={td}>{yen(r.overtime_pay)}</td>
              <td className={td}>{yen(r.transport_total)}</td>
              <td className={td}>{yen(r.lunch_total)}</td>
              <td className={td}>{yen(r.gross_pay)}</td>
              <td className={td}>{yen(r.income_tax)}</td>
              <td className={td}>{yen(r.advance_deduction)}</td>
              <td className={td}>{yen(r.net_pay)}</td>
              <td className={td}>{r.tax_category === "kou" ? "甲" : "乙"}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className={tdName} colSpan={2}>
              合計({rows.length}名)
            </td>
            <td className={td}>{totals.workDays}</td>
            <td className={td}>{hhmm(totals.totalMinutes)}</td>
            <td className={td}>{hhmm(totals.nightMinutes)}</td>
            <td className={td}>{hhmm(totals.overtimeMinutes)}</td>
            <td className={td}></td>
            <td className={td}>{yen(totals.basePay)}</td>
            <td className={td}>{yen(totals.nightPay)}</td>
            <td className={td}>{yen(totals.overtimePay)}</td>
            <td className={td}>{yen(totals.transport)}</td>
            <td className={td}>{yen(totals.lunch)}</td>
            <td className={td}>{yen(totals.gross)}</td>
            <td className={td}>{yen(totals.tax)}</td>
            <td className={td}>{yen(totals.advance)}</td>
            <td className={td}>{yen(totals.net)}</td>
            <td className={td}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
