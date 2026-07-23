-- 深夜勤務手当(22:00〜翌5:00の勤務に対する時給25%割増)の記録用カラムを追加する。
-- night_minutes: 当期の深夜帯勤務分数、night_pay: 深夜勤務手当(割増分)。
-- いずれも既存明細との互換のため既定0。
alter table public.payslips
  add column if not exists night_minutes integer not null default 0,
  add column if not exists night_pay integer not null default 0;
