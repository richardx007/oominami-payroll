-- シフトの「確定 / 調整中」モード（月ごと）
--
-- 調整中: 各従業員が自分の希望シフトを自分で入力する期間。編集できるのは自分の行だけ
--         （管理者は全員分を編集できる）。**表示は確定モードと同じく全員分**。
-- 確定  : 従来どおり。管理者だけが編集でき、全員が全員のシフトを閲覧できる。
--
-- 希望と確定は同じ `shift_assignments` に持つ（希望をそのまま調整して確定させる運用）。
-- モードが切り替わると RLS の判定だけが変わり、データの移し替えは発生しない。
create table if not exists public.shift_modes (
  period_key text primary key, -- シフト表の期間キー "YYYY-MM"
  status text not null check (status in ('draft', 'confirmed')),
  updated_at timestamptz not null default now()
);

alter table public.shift_modes enable row level security;

-- モードは全ログインユーザーが参照できる（従業員が自分で編集可否を判断するため）。
-- 変更できるのは管理者のみ。
create policy shift_modes_select on public.shift_modes
  for select using (auth.uid() is not null);
create policy shift_modes_admin on public.shift_modes
  for all using (is_admin()) with check (is_admin());

/**
 * シフト表の期間キー。設定「シフト表を1日始まり」に応じて
 * 暦月 / 給与期間（前月26日〜当月25日 = 締め月がキー）で決まる。
 * app_settings は管理者しか SELECT できないため SECURITY DEFINER で読む。
 */
create or replace function public.shift_period_key(d date)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(
      (select value from app_settings where key = 'shift_month_start'), '0'
    ) in ('1', 'true')
      then to_char(d, 'YYYY-MM')
    else to_char(
      case when extract(day from d) > 25 then (d + interval '1 month') else d end,
      'YYYY-MM'
    )
  end;
$$;

/**
 * その日のシフトが「調整中」か。
 * shift_modes に行が無い月の既定は「翌月度以降 = 調整中 / 今月度以前 = 確定」
 * （これから調整する未来の月は既定で従業員が希望を入れられる、という運用に合わせる）。
 */
create or replace function public.is_shift_draft(d date)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.status = 'draft' from shift_modes m
      where m.period_key = shift_period_key(d)),
    shift_period_key(d) > shift_period_key(((now() at time zone 'Asia/Tokyo')::date))
  );
$$;

revoke all on function public.shift_period_key(date) from public;
revoke all on function public.is_shift_draft(date) from public;
grant execute on function public.shift_period_key(date) to authenticated;
grant execute on function public.is_shift_draft(date) to authenticated;

-- 参照は従来どおり全ログインユーザーが全員分を見られる。調整中でも他の人の希望を
-- 見せるのは意図的で、希望がぶつかっていることを当人同士で調整できるようにするため。
-- （制限するのは編集操作だけ。ポリシー自体は既存のまま変更しない）

-- 追加・変更・削除: 調整中の月に限り、本人が自分の行を操作できる。
-- （管理者は既存の shift_assignments_admin (ALL/is_admin) で常に操作できる）
create policy shift_assignments_self_draft_insert on public.shift_assignments
  for insert with check (
    employee_id = current_employee_id() and is_shift_draft(work_date)
  );
create policy shift_assignments_self_draft_update on public.shift_assignments
  for update using (
    employee_id = current_employee_id() and is_shift_draft(work_date)
  ) with check (
    employee_id = current_employee_id() and is_shift_draft(work_date)
  );
create policy shift_assignments_self_draft_delete on public.shift_assignments
  for delete using (
    employee_id = current_employee_id() and is_shift_draft(work_date)
  );
