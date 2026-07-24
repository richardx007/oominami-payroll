-- 勤務予定・シフト管理の追加
-- 2026-07-19: 従業員色 / shift_assignments テーブル / シフト枠設定 / 予実突き合わせ関数
--
-- ※本プロジェクトのマイグレーションは Supabase MCP で本番プロジェクトに直接適用してきた運用のため、
--   このファイルは適用済みスキーマの記録(履歴)として残す。

-- 従業員の識別色(シフト表のニックネーム背景色に使用。10色パレットから選択・重複可・任意)
alter table public.employees add column if not exists color text;
comment on column public.employees.color is 'シフト表でニックネーム背景に使う識別色(HEX。パレット10色から選択・任意・重複可)';

-- シフト予定(1日3枠 A/B/C の交代制。1従業員1日1枠)
create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  slot text not null check (slot in ('A','B','C')),
  custom_start text,
  custom_end text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
comment on column public.shift_assignments.custom_start is '変則出勤予定(HH:MMまたは"24:00"等)。入力時は枠の既定開始時刻を上書き。空なら枠の既定を使用';
comment on column public.shift_assignments.custom_end is '変則退勤予定(HH:MMまたは"24:00"等)。入力時は枠の既定終了時刻を上書き。空なら枠の既定を使用';
create index if not exists shift_assignments_date_idx on public.shift_assignments (work_date);

alter table public.shift_assignments enable row level security;

-- 閲覧: 全ログインユーザー(従業員・管理者とも全員のシフトを閲覧可能)
drop policy if exists shift_assignments_select on public.shift_assignments;
create policy shift_assignments_select on public.shift_assignments
  for select to authenticated using (true);

-- 追加/変更/削除: 管理者のみ
drop policy if exists shift_assignments_admin on public.shift_assignments;
create policy shift_assignments_admin on public.shift_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- シフト枠の既定値(app_settings。ラベル・時刻は設定画面から編集可能)
insert into public.app_settings (key, value) values
  ('shift_slot_a_label', '早番'), ('shift_slot_a_start', '8:00'),  ('shift_slot_a_end', '17:00'),
  ('shift_slot_b_label', '遅番'), ('shift_slot_b_start', '15:00'), ('shift_slot_b_end', '0:00'),
  ('shift_slot_c_label', '深夜'), ('shift_slot_c_start', '0:00'), ('shift_slot_c_end', '9:00')
on conflict (key) do nothing;

-- "H:MM"/"HH:MM"/"24:00" を "HH24:MI"(00:00-23:59) に正規化する補助関数
create or replace function public.norm_hhmm(t text)
returns text language sql immutable set search_path = public as $$
  select case
    when t is null or t = '' then null
    else lpad((((split_part(t, ':', 1))::int % 24))::text, 2, '0')
         || ':' || lpad(coalesce(nullif(split_part(t, ':', 2), ''), '0'), 2, '0')
  end;
$$;

-- シフト予定と勤務実績の突き合わせ状態を返す(SECURITY DEFINER)。
-- 実際の勤務時刻は返さず状態(status)だけを返すため、従業員セッションでも他人の
-- シフト予実状態を安全に取得できる。status: match / missing(予定あり実績なし) /
-- timediff(時刻相違) / unplanned(実績あり予定なし)。
create or replace function public.get_shift_status(p_start date, p_end date)
returns table(employee_id uuid, work_date date, status text)
language plpgsql security definer set search_path = public as $$
declare
  a_s text; a_e text; b_s text; b_e text; c_s text; c_e text;
begin
  select value into a_s from app_settings where key = 'shift_slot_a_start';
  select value into a_e from app_settings where key = 'shift_slot_a_end';
  select value into b_s from app_settings where key = 'shift_slot_b_start';
  select value into b_e from app_settings where key = 'shift_slot_b_end';
  select value into c_s from app_settings where key = 'shift_slot_c_start';
  select value into c_e from app_settings where key = 'shift_slot_c_end';

  return query
  with slots(k, s, e) as (
    values ('A', norm_hhmm(a_s), norm_hhmm(a_e)),
           ('B', norm_hhmm(b_s), norm_hhmm(b_e)),
           ('C', norm_hhmm(c_s), norm_hhmm(c_e))
  ),
  plan as (
    select sa.employee_id eid, sa.work_date wd,
      coalesce(norm_hhmm(sa.custom_start), sl.s) ps,
      coalesce(norm_hhmm(sa.custom_end), sl.e) pe
    from shift_assignments sa
    join slots sl on sl.k = sa.slot
    where sa.work_date between p_start and p_end
  ),
  act as (
    select we.employee_id eid, we.work_date wd,
      to_char(we.start_time, 'HH24:MI') as_s,
      case when we.end_time is null then null else to_char(we.end_time, 'HH24:MI') end as_e
    from work_entries we
    where we.work_date between p_start and p_end
  )
  select
    coalesce(p.eid, a.eid),
    coalesce(p.wd, a.wd),
    case
      when p.eid is null then 'unplanned'
      when a.eid is null then 'missing'
      when p.ps = a.as_s and coalesce(p.pe, '') = coalesce(a.as_e, '') then 'match'
      else 'timediff'
    end
  from plan p
  full outer join act a on p.eid = a.eid and p.wd = a.wd;
end;
$$;

revoke all on function public.get_shift_status(date, date) from public;
grant execute on function public.get_shift_status(date, date) to authenticated;

-- シフト表の名簿(在籍・非管理者の id/氏名/ニックネーム/色)を返す。
-- 従業員は他人の employees 行を直接 SELECT できないため、閲覧用に限定列だけ返す。
create or replace function public.get_shift_roster()
returns table(id uuid, name text, nickname text, color text)
language sql security definer set search_path = public as $$
  select id, name, nickname, color
  from employees
  where status = 'active' and is_admin = false
  order by employee_no;
$$;

revoke all on function public.get_shift_roster() from public;
grant execute on function public.get_shift_roster() to authenticated;

-- シフト枠の設定(shift_slot_* )を返す。app_settings は管理者のみ SELECT 可のため、
-- 従業員のシフト閲覧画面で枠ラベル・時刻を表示するために限定して返す。
create or replace function public.get_shift_settings()
returns table(key text, value text)
language sql security definer set search_path = public as $$
  select key, value from app_settings where key like 'shift_slot_%';
$$;
revoke all on function public.get_shift_settings() from public;
grant execute on function public.get_shift_settings() to authenticated;
