/**
 * 給与計算の運用開始日(app_settings: payroll_start_date)
 *
 * 給与期間は「前月26日〜当月25日」なので、開店月は期間の前半が開店前にかかる。
 * 例: 2026年8月分は 7/26〜8/25 だが、7/27 開店で 7/27〜7/31 は日当を現金で
 * 手渡す運用にした場合、そのままだと 8/31 の給与にも含まれて二重払いになる。
 *
 * そこで運用開始日を設定し、給与計算の対象期間の開始日をこの日まで繰り下げる。
 * 例: payroll_start_date = 2026-08-01 なら 2026年8月分は 8/1〜8/25 で計算される。
 * 勤務表・QR打刻は影響を受けず、開始日より前の勤務も記録として普通に残る
 * (給与計算・締め・明細・税理士向けCSVの対象から外れるだけ)。
 *
 * 開始日より前の勤務分の支払いは「日当レポート」(/admin/daily)で金額を確認し、
 * 給与システムの外で精算する。
 */

import { createClient } from "./supabase/server";
import { periodFromKey, type Period } from "./period";

export const PAYROLL_START_KEY = "payroll_start_date";

/** "YYYY-MM-DD" 形式かどうか(緩いチェック。空文字・未設定は null 扱い) */
function normalizeDate(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 運用開始日を取得する。未設定なら null(=制限なし) */
export async function getPayrollStartDate(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", PAYROLL_START_KEY)
      .maybeSingle();
    return normalizeDate(data?.value);
  } catch {
    return null;
  }
}

/**
 * 期間の開始日を運用開始日まで繰り下げた期間を返す。
 * 開始日が未設定、または期間の開始日以前なら元の期間をそのまま返す。
 */
export function clampPeriodStart(
  period: Period,
  payrollStart: string | null
): Period {
  const start = normalizeDate(payrollStart);
  if (!start || start <= period.start) return period;
  return { ...period, start };
}

/** 期間全体が運用開始日より前かどうか(この期間は給与計算の対象外) */
export function isBeforePayrollStart(
  period: Period,
  payrollStart: string | null
): boolean {
  const start = normalizeDate(payrollStart);
  return start !== null && start > period.end;
}

/** 運用開始日で開始日を繰り下げた期間を返す(DBから設定を読む版) */
export async function effectivePeriod(period: Period): Promise<Period> {
  return clampPeriodStart(period, await getPayrollStartDate());
}

/**
 * "YYYY-MM" のキーから、運用開始日を反映した期間を返す(不正値は null)。
 * 給与計算・締め・明細配信・帳票は pay_periods を start/end で引き当てるため、
 * どれか1つでも素の periodFromKey() を使うと期間が一致しなくなる。給与まわりでは
 * 必ずこちらを使うこと。
 */
export async function effectivePeriodFromKey(
  key: string
): Promise<Period | null> {
  const period = periodFromKey(key);
  if (!period) return null;
  return await effectivePeriod(period);
}
