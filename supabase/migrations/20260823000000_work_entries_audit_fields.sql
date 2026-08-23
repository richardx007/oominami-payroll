-- 勤務表の編集枠に「登録/修正のタイムスタンプ・ユーザ」を表示するための下地。
-- work_entries に created_by/updated_by (employees.id) を追加し、
-- created_by は INSERT 時に updated_by から補完、UPDATE 時は常に元の値を保持する
-- (アプリ側は毎回 updated_by=操作者 を送るだけでよい)。

alter table public.work_entries
  add column created_by uuid references public.employees(id) on delete set null,
  add column updated_by uuid references public.employees(id) on delete set null;

create function public.set_work_entry_audit() returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, new.updated_by);
  elsif tg_op = 'UPDATE' then
    new.created_by = old.created_by;
  end if;
  return new;
end $$;

create trigger work_entries_audit
  before insert or update on public.work_entries
  for each row execute function public.set_work_entry_audit();

-- created_by/updated_by の表示名解決用。employees の直接SELECTはRLSで自分自身
-- (または管理者)に限られるため、担当者名(ニックネーム優先)だけを返す関数で
-- 必要な範囲だけ横断参照できるようにする(get_shift_roster等と同じ方針)。
create function public.get_employee_names(p_ids uuid[])
returns table(id uuid, display_name text)
language sql
security definer
set search_path to 'public'
as $$
  select id, coalesce(nullif(trim(nickname), ''), name)
  from employees
  where id = any(p_ids);
$$;

revoke all on function public.get_employee_names(uuid[]) from public;
grant execute on function public.get_employee_names(uuid[]) to authenticated;
grant execute on function public.get_employee_names(uuid[]) to service_role;
