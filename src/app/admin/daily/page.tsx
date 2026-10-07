import { requireAdmin } from "@/lib/auth";
import { loadDailyReport } from "@/lib/daily-report";
import { currentPeriod, periodFromKey } from "@/lib/period";
import { DailyReportView } from "./report-view";

/**
 * 日別実績: 給与期間(前月26日〜当月25日)ごとの「従業員 × 日ごと」の勤務時間・支給額一覧。
 * 日当を現金で手渡すときに、その日いくら渡せばよいかを確認するために使う
 * (計算方法は月次の給与計算と同じ)。渡した分は各行から「前払金」として
 * 記録でき、その勤務日を含む給与期間の差引支給額から控除される。
 */
export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; retired?: string }>;
}) {
  const { p, retired } = await searchParams;
  // 期間の指定方法は給与明細画面と揃える(月度単位・前月/翌月で移動)
  const period = (p && periodFromKey(p)) || currentPeriod();
  // 退職者を含めるかは既定オフ(仮の退職者複製が混ざって紛らわしいため。2026-08-20)
  const includeRetired = retired === "1";

  // 権限確認と集計を並行して行う(月度切り替えの待ち時間を減らすため。2026-10-07)。
  // 集計はログイン中の本人の権限(RLS)で読むので、管理者でなければ requireAdmin が
  // リダイレクトし、集計結果は使われずに捨てられる。
  const [, report] = await Promise.all([
    requireAdmin(),
    loadDailyReport(period.start, period.end, undefined, includeRetired),
  ]);

  return (
    <DailyReportView
      period={period}
      report={report}
      basePath="/admin/daily"
      title="日別実績"
      descriptionLines={[
        "日別の支給額が確認できます。（源泉徴収は月給時にまとめます。）",
        "日当の前払いをした場合は「前払済」ボタンを押してください。月末の支給額からは除外されます。",
      ]}
      editable
      includeRetired={includeRetired}
    />
  );
}
