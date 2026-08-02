-- 従業員によるシフト予定のロック（2026-08-02）
--
-- 従業員本人が「この日は勤務不可能」または「このシフト希望は変更不可」の意志を示すためのフラグ。
-- ロックされた日は **管理者であってもシフトの追加・変更・削除ができない**（本人が外すまで）。
-- 「確定」モードになった後も有効。
--
-- shift_assignments とは別テーブルにしている理由:
--   shift_assignments.slot は NOT NULL のため「勤務不可（シフトなし）」を表現できない。
--   別テーブルなら、シフトの有無に関わらずロックを保持できる（両方の意味を1つの仕組みで扱える）。
create table if not exists public.shift_locks (
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  created_at timestamptz not null default now(),
  primary key (employee_id, work_date)
);

alter table public.shift_locks enable row level security;

-- 参照は全ログインユーザー。誰がどの日をロックしているかは、シフトを調整する当人同士・
-- 管理者の双方に見えている必要がある（シフト予定の閲覧が全員に開いているのと同じ考え方）。
create policy shift_locks_select on public.shift_locks
  for select using (auth.uid() is not null);

-- 付ける・外せるのは本人だけ。**管理者にも許可しない**（管理者が外せると
-- 「独断で変更させない」という趣旨が成立しないため。2026-08-02にオーナー判断）。
create policy shift_locks_self_insert on public.shift_locks
  for insert with check (employee_id = current_employee_id());
create policy shift_locks_self_delete on public.shift_locks
  for delete using (employee_id = current_employee_id());

/**
 * その従業員・その日のシフト予定がロックされているか。
 * shift_assignments のポリシーから参照するため SECURITY DEFINER
 * （一般ユーザーが他人のロック行を直接読めるかに依存せず判定させる）。
 */
create or replace function public.is_shift_locked(p_employee_id uuid, d date)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shift_locks l
    where l.employee_id = p_employee_id and l.work_date = d
  );
$$;

revoke all on function public.is_shift_locked(uuid, date) from public;
grant execute on function public.is_shift_locked(uuid, date) to authenticated;

-- 管理者のシフト操作から「ロックされた日」を除外する。
-- USING = 既存行の変更/削除、WITH CHECK = 追加/変更後の行。両方に条件を入れないと
-- 「ロック日への新規追加」や「ロック日へ移動させる更新」を防げない。
drop policy if exists shift_assignments_admin on public.shift_assignments;
create policy shift_assignments_admin on public.shift_assignments
  for all
  using (is_admin() and not is_shift_locked(employee_id, work_date))
  with check (is_admin() and not is_shift_locked(employee_id, work_date));
