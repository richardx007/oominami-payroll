-- 立替を給与で精算する(2026-10-07 オーナー依頼。設計: oominami-business の docs/payroll-reimbursement-plan.md)
-- 給与明細に「立替精算」(経費の払い戻し・非課税)の合計を持つ。総支給額・課税対象額・差引支給額には含めない。
-- お振込額 = 差引支給額 + 立替精算。内訳は経費管理の expense_entries(payroll_period_id = この月度)にある。
-- 値は締め処理(closePeriod)が経費管理の関数 expense_payroll_attach の結果から入れる。

alter table public.payslips
  add column expense_reimbursement integer not null default 0 check (expense_reimbursement >= 0);
comment on column public.payslips.expense_reimbursement is
  '立替精算(従業員が立て替えた経費の払い戻し。非課税・給与ではない)。総支給額・差引支給額には含めない。お振込額 = net_pay + この値。';
