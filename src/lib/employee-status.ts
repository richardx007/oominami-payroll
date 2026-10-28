/**
 * 従業員の状態(employees.status)。
 * - active: 在職
 * - retired: 退職(ログイン不可)
 * - dummy: ダミー(本番で使うテスト用の見えない従業員。2026-10-28)。在職と同じように使えるが、
 *   見えるのはシステム管理者(オーナー以外の管理者)とダミー本人だけ(DB の RLS が隠す。
 *   supabase/migrations/20261028120000_dummy_employees.sql)。税理士向けの集計・月の合計には入れない
 * ⚠️ 経費管理(oominami-business)と DB を共用している
 */
export type EmployeeStatus = "active" | "retired" | "dummy";

/** 在職と同じに扱う状態(ログイン・打刻・明細の送付の対象)。DB の絞り込み(.in)にも使う */
export const WORKING_STATUSES = ["active", "dummy"] as const;

export function isWorkingStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "dummy";
}

export function isDummyStatus(status: string | null | undefined): boolean {
  return status === "dummy";
}
