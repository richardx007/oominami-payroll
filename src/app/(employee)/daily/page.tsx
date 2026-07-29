import { requireEmployee } from "@/lib/auth";
import { loadDailyReport } from "@/lib/daily-report";
import { currentPeriod, periodFromKey } from "@/lib/period";
import { DailyReportView } from "@/app/admin/daily/report-view";

/** 従業員自身の日別実績(自分の勤務のみ・前払金は記録済みの表示のみで編集不可)。 */
export default async function EmployeeDailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const employee = await requireEmployee();
  const { p } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const report = await loadDailyReport(period.start, period.end, employee.id);

  return (
    <DailyReportView
      period={period}
      report={report}
      basePath="/daily"
      title="日別実績"
      descriptionLines={[
        "日別の支給額が確認できます。（源泉徴収は月給時にまとめます。）",
        "日当の前払いが行われた場合もここで確認できます。",
      ]}
      editable={false}
    />
  );
}
