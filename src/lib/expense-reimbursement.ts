import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 立替の給与精算(2026-10-07。経費管理アプリと共用の DB。設計: oominami-business の docs/payroll-reimbursement-plan.md)。
 *
 * 従業員が立て替えた経費(経費管理で確認済み・未精算)を、給与と一緒に支払って精算する。
 * - 締め: 経費管理の関数 `expense_payroll_attach` が、購入日が締め日以前の立替をその月度に乗せ、従業員ごとの合計を返す
 * - 締め解除: `expense_payroll_detach` / 支払済み: `expense_payroll_mark_paid`(精算日 = 支払日)
 * 立替精算は給与ではない(実費の払い戻し・非課税)ので、総支給額・課税対象額・差引支給額には入れず、
 * 「お振込額 = 差引支給額 + 立替精算」として別の行で見せる。経費のテーブルは直接書き換えない(関数を呼ぶだけ)。
 */

/** 立替の内訳1件(購入日・購入先・品名・金額) */
export type ReimbursementItem = {
  purchased_on: string;
  vendor: string;
  description: string;
  amount: number;
};

export type Reimbursement = { total: number; items: ReimbursementItem[] };

/** 従業員 ID → 立替精算 */
export type ReimbursementMap = Map<string, Reimbursement>;

type Row = ReimbursementItem & { advanced_by: string };

const COLS = "advanced_by, purchased_on, vendor, description, amount";

/**
 * 月度の立替精算を読む。
 * - 締め済み・支払済み(periodId あり・open 以外): その月度に乗った立替(締めのときに決まったもの)
 * - 締め前: 今締めたら乗る立替の見込み(確認済み・未精算・購入日が締め日以前・まだどの月度にも乗っていない)
 * 経費管理の RLS により、管理者は全員分、従業員は自分が立替者の分だけが読める
 */
export async function loadReimbursements(
  supabase: SupabaseClient,
  opts: { periodId: string | null; status: string; end: string; employeeId?: string }
): Promise<ReimbursementMap> {
  let q = supabase.from("expense_entries").select(COLS).is("deleted_at", null);
  if (opts.periodId && opts.status !== "open") {
    q = q.eq("payroll_period_id", opts.periodId);
  } else {
    q = q
      .is("payroll_period_id", null)
      .not("advanced_by", "is", null)
      .eq("status", "approved")
      .is("reimbursed_at", null)
      .lte("purchased_on", opts.end);
  }
  if (opts.employeeId) q = q.eq("advanced_by", opts.employeeId);
  const { data, error } = await q.order("purchased_on").order("created_at");
  if (error) throw new Error(`立替精算の読み込みに失敗しました: ${error.message}`);
  return groupReimbursements((data ?? []) as Row[]);
}

/** 立替者ごとにまとめる(内訳は購入日順のまま) */
export function groupReimbursements(rows: Row[]): ReimbursementMap {
  const map: ReimbursementMap = new Map();
  for (const r of rows) {
    const cur = map.get(r.advanced_by) ?? { total: 0, items: [] };
    cur.total += r.amount;
    cur.items.push({ purchased_on: r.purchased_on, vendor: r.vendor, description: r.description, amount: r.amount });
    map.set(r.advanced_by, cur);
  }
  return map;
}

/** 立替の内訳の1行「9/18 コーナン(ゴミ袋) ¥2,160」用の日付 */
export function itemDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}
