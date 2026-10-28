import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  adjacentPeriodKey,
  currentPeriod,
  periodFromKey,
  todayJST,
} from "@/lib/period";
import { calculatePeriodPayroll } from "@/lib/payroll-data";
import { isDummyStatus } from "@/lib/employee-status";
import { periodStatusBadgeClass, periodStatusLabel } from "@/lib/period-status";
import { PAYSLIP_ISSUER_KEYS, parsePayslipIssuer } from "@/lib/payslip-issuer";
import { CloseActions } from "./ui";
import { loadReimbursements } from "@/lib/expense-reimbursement";
import { PayslipReport } from "./payslip-report";
import { WithholdingSection } from "./withholding";

export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; y?: string }>;
}) {
  const me = await requireAdmin();
  const { p, y } = await searchParams;
  const period = (p && periodFromKey(p)) || currentPeriod();

  const supabase = await createClient();
  const today = todayJST();
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("id, status")
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .maybeSingle();

  const status = payPeriod?.status ?? "open";
  // 締め前(status==="open")は常に退勤未入力の日(進行中の勤務など)を除外して計算する。
  // これにより「入力受付中」の間は常に現時点の最新の勤務実績に基づく暫定額を確認できる
  // (2026-08-21、トグル切替は不要という要望を受けて常時適用に変更。締め済み以降は
  // 全日入力済みであるはずなので通常どおり厳密に計算する)。
  const tentative = status === "open";
  const payrolls = await calculatePeriodPayroll(period, {
    ignoreIncomplete: tentative,
  });
  const reportPayrolls = payrolls.filter((p) => !isDummyStatus(p.status));
  // 立替の給与精算(2026-10-07)。締め後はこの月度に乗せた立替、締め前は今締めたら乗る見込み。
  // 給与ではない(非課税の実費の払い戻し)ので、差引支給の右に「立替精算」「お振込額」として別に出す
  const reimbursements = await loadReimbursements(supabase, {
    periodId: payPeriod?.id ?? null,
    status,
    end: period.end,
  });

  // シフト予定と勤務実績で時刻が食い違う日がある従業員を洗い出す(勤務表画面と同じ突合)。
  // timediff=時刻相違 / unplanned=予定なしで勤務。該当者の勤務時間欄に⚠️を出し、
  // タップで勤務表(該当従業員を選択)へ飛べるようにする。
  // ※ 退勤未入力(actual_end が null)の日は「未確定」であり、まだ相違とは言えないので除外する。
  const { data: shiftStatusRows } = await supabase.rpc("get_shift_status", {
    p_start: period.start,
    p_end: period.end,
  });
  const mismatchIds = new Set<string>(
    (
      (shiftStatusRows ?? []) as {
        employee_id: string;
        status: string;
        actual_end: string | null;
      }[]
    )
      .filter(
        (r) =>
          (r.status === "timediff" || r.status === "unplanned") &&
          !!r.actual_end
      )
      .map((r) => r.employee_id)
  );

  // 従業員別の給与明細PDF(各行の右端の「PDF」ボタン)の右上に印字する支払元(2行)と印。
  // 設定画面の「給与明細PDF(支払元・印)」で登録する。
  const { data: issuerRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", PAYSLIP_ISSUER_KEYS);
  const issuer = parsePayslipIssuer(issuerRows ?? []);

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

        {/* 操作ボタンはヘッダ部分に配置(締め/支払・明細配信・締め解除・税理士資料操作) */}
        <CloseActions periodKey={period.key} status={status} />
      </div>

      {/* id は PDFダウンロード(DownloadPdfButton)・税理士へのメール添付のキャプチャ対象。
          変更する場合は admin/close/ui.tsx の targetId・pdfTargetId も合わせること。
          ダミー従業員(システム管理者にだけ見える)がいるときは、画面にはダミー込みの表を出し、
          PDF 用にはダミーを除いた表を画面外に描く(PDF は税理士・オーナーに渡るため) */}
      <PayslipReport
        id={reportPayrolls.length === payrolls.length ? "payslip-report" : "payslip-report-with-dummies"}
        period={period}
        status={status}
        payrolls={payrolls}
        reimbursements={reimbursements}
        mismatchIds={mismatchIds}
        issuer={issuer}
      />
      {reportPayrolls.length !== payrolls.length && (
        <div aria-hidden className="fixed top-0 -left-[10000px]">
          <PayslipReport
            id="payslip-report"
            period={period}
            status={status}
            payrolls={reportPayrolls}
            reimbursements={reimbursements}
            mismatchIds={mismatchIds}
            issuer={issuer}
          />
        </div>
      )}

      {/* 源泉徴収票(年ごと。?y= で切り替え、既定は今年) */}
      <WithholdingSection
        supabase={supabase}
        year={Number(y) || Number(today.slice(0, 4))}
        today={today}
        periodKey={period.key}
        isOwner={me.is_owner}
      />
    </div>
  );
}
