-- 前払金(日当として先に現金で支払った分)
--
-- 給与期間は「前月26日〜当月25日」なので、開店直後などに日当を現金で手渡すと、
-- 同じ勤務が月末の給与にも含まれて二重払いになる。そこで日当は「前払金」として
-- 記録し、月末の給与計算では総支給額・課税対象額・源泉所得税はそのまま計算した
-- うえで、差引支給額から前払金を控除する。
--   差引支給額 = 総支給額 - 源泉所得税 - 前払金
-- 源泉徴収は月額表による月単位の計算のまま変わらない(前払金は所得の控除ではなく、
-- 既に支払った分の精算のため)。
--
-- work_date は「対象の勤務日」。この日を含む給与期間で控除されるため、前払いした
-- 勤務と同じ期間から必ず差し引かれる。1勤務日につき1件(重複記録の防止)。
create table if not exists public.advance_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  amount integer not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists advance_payments_work_date_idx
  on public.advance_payments (work_date);

alter table public.advance_payments enable row level security;

-- 従業員は自分の前払金を参照できる(給与明細の内訳として表示するため)。
-- 登録・変更・削除は管理者のみ。
create policy advance_payments_select on public.advance_payments
  for select using (employee_id = current_employee_id() or is_admin());
create policy advance_payments_admin on public.advance_payments
  for all using (is_admin()) with check (is_admin());

-- 確定明細にも前払金の控除額を保存する(締めた時点の金額を残す)
alter table public.payslips
  add column if not exists advance_deduction integer not null default 0;
