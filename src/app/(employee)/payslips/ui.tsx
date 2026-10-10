"use client";

import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period";
import { adjacentPeriodKey, formatMinutes } from "@/lib/period";
import { useSwipeNav } from "@/lib/useSwipeNav";
import { itemDate, type ReimbursementItem } from "@/lib/expense-reimbursement";
import Link from "next/link";
import { PayslipPdfButton, type PayslipPdfData } from "@/app/admin/close/payslip-pdf";
import type { PayslipIssuer } from "@/lib/payslip-issuer";
import {
  WithholdingSlipButton,
  type WithholdingSlipData,
} from "@/components/WithholdingSlipButton";

/** 自分の給与明細PDFの元データ(確定済みの明細があるときだけ) */
export type SlipPdf = { data: PayslipPdfData; issuer: PayslipIssuer };

export type Slip = {
  work_days: number;
  total_minutes: number;
  night_minutes: number;
  overtime_minutes: number;
  hourly_wage: number;
  base_pay: number;
  night_pay: number;
  overtime_pay: number;
  transport_total: number;
  lunch_total: number;
  gross_pay: number;
  income_tax: number;
  advance_deduction: number;
  net_pay: number;
  tax_category: string;
  /** 立替精算(経費の払い戻し・非課税。2026-10-07)。差引支給額には含めない */
  expense_reimbursement: number;
  /** 立替の内訳(別表) */
  reimbursementItems: ReimbursementItem[];
  /** 表示中の月度が属する pay_periods の状態(closed/paid) */
  status: string;
};

/**
 * 給与明細本体(月度ごと)。勤務表・日別実績と同様、左右スワイプで前後の月度へ移動する。
 * スワイプ中はカレンダーと同じく新データ到着まで中身を白紙にする(`useSwipeNav`の`blank`)。
 */
export function PayslipView({
  period,
  slip,
  pdf,
}: {
  period: Period;
  slip: Slip | null;
  pdf: SlipPdf | null;
}) {
  const router = useRouter();

  function periodHref(delta: 1 | -1) {
    return `/payslips?p=${adjacentPeriodKey(period.key, delta)}`;
  }
  const { blank, attach } = useSwipeNav(
    () => router.push(periodHref(1)),
    () => router.push(periodHref(-1)),
    period.key
  );

  return (
    <div className="overflow-hidden">
      <div ref={attach}>
        {blank ? (
          <div className="h-40 rounded-xl border border-gray-200 bg-white" />
        ) : !slip ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            この月度の給与明細はまだありません
          </p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white">
            {/* 見出し行: 「〜月度」は上のヘッダと重複するため出さず、差引支給額をここに表示する。
                日別実績の一覧見出しと同じ色(bg-result-100)に揃える */}
            <div className="rounded-t-xl border-b border-result-200 bg-result-100 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  差引支給額
                </span>
                <div className="flex items-center gap-2">
                  {slip.status === "paid" && (
                    <span className="rounded bg-green-700/10 px-1.5 py-0.5 text-xs font-medium text-green-800">
                      支払済み
                    </span>
                  )}
                  {/* 自分の給与明細をPDFで保存・共有する(2026-10-10) */}
                  {pdf && <PayslipPdfButton data={pdf.data} issuer={pdf.issuer} />}
                </div>
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                ¥{slip.net_pay.toLocaleString()}
              </div>
            </div>
            <div className="p-4">
              <dl className="space-y-2 text-sm">
                <Row label="勤務日数" value={`${slip.work_days}日`} />
                <Row
                  label="勤務時間"
                  value={formatMinutes(slip.total_minutes) || "0時間"}
                />
                <Row
                  label={`基本給(時給 ¥${slip.hourly_wage.toLocaleString()})`}
                  value={`¥${slip.base_pay.toLocaleString()}`}
                />
                {slip.night_minutes > 0 && (
                  <>
                    <Row
                      label="深夜勤務時間(時給25%増)"
                      value={formatMinutes(slip.night_minutes) || "0時間"}
                    />
                    <Row
                      label={`深夜勤務手当(時給加算 ¥${Math.round(
                        slip.hourly_wage * 0.25
                      ).toLocaleString()})`}
                      value={`¥${slip.night_pay.toLocaleString()}`}
                    />
                  </>
                )}
                {slip.overtime_minutes > 0 && (
                  <>
                    <Row
                      label="残業時間(時給25%増)"
                      value={formatMinutes(slip.overtime_minutes) || "0時間"}
                    />
                    <Row
                      label={`残業手当(時給加算 ¥${Math.round(
                        slip.hourly_wage * 0.25
                      ).toLocaleString()})`}
                      value={`¥${slip.overtime_pay.toLocaleString()}`}
                    />
                  </>
                )}
                <Row
                  label="交通費"
                  value={`¥${slip.transport_total.toLocaleString()}`}
                />
                <Row
                  label="昼食補助"
                  value={`¥${slip.lunch_total.toLocaleString()}`}
                />
                <div className="border-t border-gray-100 pt-2">
                  <Row
                    label="総支給額"
                    value={`¥${slip.gross_pay.toLocaleString()}`}
                    bold
                  />
                </div>
                <Row
                  label={`源泉所得税(${slip.tax_category === "kou" ? "甲欄" : "乙欄"})`}
                  value={`−¥${slip.income_tax.toLocaleString()}`}
                  negative
                />
                {/* 日当として先に受け取った分。ある場合のみ控除として表示する */}
                {slip.advance_deduction > 0 && (
                  <Row
                    label="前払金(日当としてお支払い済み)"
                    value={`−¥${slip.advance_deduction.toLocaleString()}`}
                    negative
                  />
                )}
                <div className="border-t border-gray-100 pt-2">
                  <Row
                    label="差引支給額"
                    value={`¥${slip.net_pay.toLocaleString()}`}
                    bold
                  />
                </div>
                {/* 立替精算は給与ではない(立て替えた経費の払い戻し・非課税)。お振込額 = 差引支給額 + 立替精算 */}
                {slip.expense_reimbursement > 0 && (
                  <>
                    <Row
                      label="立替精算(経費の払い戻し・非課税)"
                      value={`¥${slip.expense_reimbursement.toLocaleString()}`}
                    />
                    <div className="border-t border-gray-100 pt-2">
                      <Row
                        label="お振込額"
                        value={`¥${(slip.net_pay + slip.expense_reimbursement).toLocaleString()}`}
                        bold
                      />
                    </div>
                  </>
                )}
              </dl>
            </div>
            {/* 別表: 立替の内訳 */}
            {slip.reimbursementItems.length > 0 && (
              <div className="border-t border-gray-200">
                <div className="border-b border-result-200 bg-result-100 px-4 py-2 text-sm font-semibold text-gray-700">
                  別表 立替の内訳
                </div>
                <ul className="divide-y divide-gray-100 px-4 text-sm">
                  {slip.reimbursementItems.map((i, idx) => (
                    <li key={idx} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="mr-2 text-gray-500">{itemDate(i.purchased_on)}</span>
                        {i.vendor}
                        <span className="ml-1 text-xs text-gray-500">{i.description}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">¥{i.amount.toLocaleString()}</span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-3 py-2 font-bold">
                    <span>合計</span>
                    <span className="tabular-nums">¥{slip.expense_reimbursement.toLocaleString()}</span>
                  </li>
                </ul>
                <p className="px-4 pb-3 text-xs text-gray-500">
                  立て替えた経費の払い戻しで、給与ではありません(所得税はかかりません)。
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 源泉徴収票(支払のある年ごと)。年の途中の年は「途中経過」として出す(正式なものは年明けに)。
 * 住所・生年月日が未入力なら、設定画面での入力を案内する。
 */
export function WithholdingSection({ slips }: { slips: WithholdingSlipData[] }) {
  if (slips.length === 0) return null;
  const missing = slips.some((s) => !s.address || !s.birthDate);
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">源泉徴収票</h2>
      <p className="mt-1 text-xs text-gray-500">
        その年に支払われた給与の合計です。年の途中の分は途中経過で、正式な源泉徴収票は年が明けてから出せます。
      </p>
      {missing && (
        <p className="mt-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          住所・生年月日が未入力です。
          <Link href="/account" className="font-medium underline">
            アカウント設定
          </Link>
          で入力してから出力してください。
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {slips.map((s) => (
          <WithholdingSlipButton
            key={s.totals.year}
            data={s}
            label={`${s.totals.year}年分${s.inProgressAsOf ? "(途中経過)" : ""}`}
          />
        ))}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`${bold ? "font-bold" : ""} ${negative ? "text-red-600" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
