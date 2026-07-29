"use client";

import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period";
import { adjacentPeriodKey, formatMinutes } from "@/lib/period";
import { useSwipeNav } from "@/lib/useSwipeNav";

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
}: {
  period: Period;
  slip: Slip | null;
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
                {slip.status === "paid" && (
                  <span className="rounded bg-green-700/10 px-1.5 py-0.5 text-xs font-medium text-green-800">
                    支払済み
                  </span>
                )}
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
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
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
