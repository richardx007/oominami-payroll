-- 残業手当(1日8時間超過分に時給25%増)を給与明細に追加する。
alter table public.payslips
  add column if not exists overtime_minutes integer not null default 0,
  add column if not exists overtime_pay integer not null default 0;

comment on column public.payslips.overtime_minutes is '1日8時間を超えた残業分数の合計';
comment on column public.payslips.overtime_pay is '残業手当(単価の25%割増分)の合計';
