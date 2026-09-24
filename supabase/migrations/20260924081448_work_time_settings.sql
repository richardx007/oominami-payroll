-- シフト枠・休憩時間を「適用開始日」で切り替えられるようにする
-- 2026-09-24: 営業時間の変更に連動して勤務時間も変わるため、「営業時間の定義」画面を
-- 「営業と勤務時間」とし、1つの適用開始日で 営業時間・シフト枠・休憩時間 をセットで管理する。
--
-- work_time_settings は (適用開始日, キー) ごとに1行。キーは従来 app_settings にあったもの
-- （shift_slot_{a,b,c}_{label,start,end} / break_window_{1,2,3}_{start,end}）と同じ名前。
-- ある日に使う値は「キーごとに、その日以前で最も新しい適用開始日の値」（関数 work_setting_at）。
-- 適用開始日の集合は business_hour_patterns と常に同じ（保存・削除は save_hours_version /
-- delete_hours_version で両方まとめて行う）。
-- ※TS側 src/lib/work-time.ts の workSettingsAt() が同じ規則を持つ。**片方だけ変えないこと。**
--
-- app_settings の旧キー（shift_slot_* / break_window_*）はこのマイグレーション以降は使わない
-- （デプロイ切替中の旧コードのために消さずに残す）。shift_month_start は引き続き app_settings。

create table if not exists public.work_time_settings (
  effective_from date not null,
  key text not null check (key ~ '^(shift_slot_[abc]_(label|start|end)|break_window_[123]_(start|end))$'),
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null,
  primary key (effective_from, key)
);

comment on table public.work_time_settings is
  'シフト枠・休憩時間の定義(適用開始日×キー)。キーごとに、その日以前で最も新しい effective_from の値を使う。適用開始日は business_hour_patterns と同じ集合。';

alter table public.work_time_settings enable row level security;

-- シフト時刻・休憩時間帯は従業員の画面（勤務表・シフト表）でも使うため、ログイン済みなら読める
drop policy if exists work_time_settings_select on public.work_time_settings;
create policy work_time_settings_select on public.work_time_settings
  for select to authenticated using (true);
drop policy if exists work_time_settings_admin on public.work_time_settings;
create policy work_time_settings_admin on public.work_time_settings
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on public.work_time_settings to authenticated;
grant insert, update, delete on public.work_time_settings to authenticated;

-- 既存の設定を、営業時間の各適用開始日にそのまま写す（未設定の休憩は従来の既定値）
insert into public.work_time_settings (effective_from, key, value)
select v.effective_from, d.key, coalesce(nullif(trim(s.value), ''), d.def)
from (select distinct effective_from from public.business_hour_patterns
      union select date '2000-01-01') v
cross join (values
  ('shift_slot_a_label', '早番'), ('shift_slot_a_start', '8:00'),  ('shift_slot_a_end', '17:00'),
  ('shift_slot_b_label', '遅番'), ('shift_slot_b_start', '15:00'), ('shift_slot_b_end', '0:00'),
  ('shift_slot_c_label', '深夜'), ('shift_slot_c_start', '0:00'),  ('shift_slot_c_end', '9:00'),
  ('break_window_1_start', '12:00'), ('break_window_1_end', '13:00'),
  ('break_window_2_start', '19:00'), ('break_window_2_end', '20:00'),
  ('break_window_3_start', '4:00'),  ('break_window_3_end', '5:00')
) as d(key, def)
left join public.app_settings s on s.key = d.key
on conflict (effective_from, key) do nothing;

-- その日に有効な値
create or replace function public.work_setting_at(p_date date, p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from work_time_settings
  where key = p_key and effective_from <= p_date
  order by effective_from desc
  limit 1;
$$;

revoke all on function public.work_setting_at(date, text) from public, anon;
grant execute on function public.work_setting_at(date, text) to authenticated;

-- 営業時間・シフト枠・休憩時間を1つの適用開始日でまとめて保存する（管理者のみ。RLSで制限）
-- p_patterns: [{day_type, is_open, open_min, close_min, overnight}] / p_settings: {key: value}
create or replace function public.save_hours_version(p_from date, p_patterns jsonb, p_settings jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_by uuid := current_employee_id();
begin
  if not is_admin() then
    raise exception '管理者のみ実行できます';
  end if;

  insert into business_hour_patterns
    (day_type, effective_from, is_open, open_min, close_min, overnight, updated_at, updated_by)
  select p.day_type, p_from, p.is_open,
         case when p.is_open then p.open_min end,
         case when p.is_open and not p.overnight then p.close_min end,
         p.is_open and p.overnight, now(), v_by
  from jsonb_to_recordset(p_patterns)
    as p(day_type text, is_open boolean, open_min int, close_min int, overnight boolean)
  on conflict (day_type, effective_from) do update set
    is_open = excluded.is_open, open_min = excluded.open_min, close_min = excluded.close_min,
    overnight = excluded.overnight, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  insert into work_time_settings (effective_from, key, value, updated_at, updated_by)
  select p_from, s.key, s.value, now(), v_by
  from jsonb_each_text(p_settings) s
  on conflict (effective_from, key) do update set
    value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.save_hours_version(date, jsonb, jsonb) from public, anon;
grant execute on function public.save_hours_version(date, jsonb, jsonb) to authenticated;

-- 適用開始日の定義をまとめて削除する（最初の定義は削除できない）。削除した営業時間の行数を返す
create or replace function public.delete_hours_version(p_from date)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception '管理者のみ実行できます';
  end if;
  if p_from <= date '2000-01-01' then
    raise exception '最初の定義は削除できません';
  end if;
  delete from business_hour_patterns where effective_from = p_from;
  get diagnostics v_count = row_count;
  delete from work_time_settings where effective_from = p_from;
  return v_count;
end;
$$;

revoke all on function public.delete_hours_version(date) from public, anon;
grant execute on function public.delete_hours_version(date) to authenticated;

-- シフト予実の突き合わせ: 予定時刻はその日の枠の定義で決める（それ以外は 20260809000000 と同じ）
create or replace function public.get_shift_status(p_start date, p_end date)
returns table(employee_id uuid, work_date date, status text, planned_start text, planned_end text, actual_start text, actual_end text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with plan as (
    select sa.employee_id eid, sa.work_date wd,
      coalesce(norm_hhmm(sa.custom_start),
               norm_hhmm(work_setting_at(sa.work_date, 'shift_slot_' || lower(sa.slot) || '_start'))) ps,
      coalesce(norm_hhmm(sa.custom_end),
               norm_hhmm(work_setting_at(sa.work_date, 'shift_slot_' || lower(sa.slot) || '_end'))) pe
    from shift_assignments sa
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
    end,
    p.ps,
    p.pe,
    a.as_s,
    a.as_e
  from plan p
  full outer join act a on p.eid = a.eid and p.wd = a.wd;
end;
$$;

-- 未打刻通知: 予定時刻はその日の枠の定義で決める（それ以外は 20260804060000 と同じ）
create or replace function public.collect_punch_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp;
  v_enabled_in boolean;
  v_enabled_out boolean;
  v_delay_in interval := interval '5 minutes';
  v_delay_out interval := interval '30 minutes';
  v_window interval := interval '12 hours';
  v_alerts jsonb;
  v_subs jsonb;
begin
  select coalesce(
    (select value <> 'false' from app_settings where key = 'notify_missing_punch_in'),
    true
  ) into v_enabled_in;
  select coalesce(
    (select value <> 'false' from app_settings where key = 'notify_missing_punch_out'),
    true
  ) into v_enabled_out;

  if not v_enabled_in and not v_enabled_out then
    return jsonb_build_object('alerts', '[]'::jsonb, 'subscriptions', '[]'::jsonb);
  end if;

  v_now := (now() at time zone 'Asia/Tokyo');

  with slot_default(slot, s, e) as (
    values ('A'::text, interval '8 hours', interval '17 hours'),
           ('B', interval '15 hours', interval '0 hours'),
           ('C', interval '0 hours', interval '9 hours')
  ),
  raw as (
    select
      sa.employee_id,
      sa.work_date,
      coalesce(parse_slot_time(nullif(trim(sa.custom_start), '')),
               parse_slot_time(work_setting_at(sa.work_date, 'shift_slot_' || lower(sa.slot) || '_start')),
               sd.s) as s,
      coalesce(parse_slot_time(nullif(trim(sa.custom_end), '')),
               parse_slot_time(work_setting_at(sa.work_date, 'shift_slot_' || lower(sa.slot) || '_end')),
               sd.e) as e
    from shift_assignments sa
    join slot_default sd on sd.slot = sa.slot
    where sa.work_date between (v_now::date - 2) and (v_now::date + 1)
  ),
  sched as (
    select
      r.employee_id,
      r.work_date,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end) as start_at,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end)
        + (case when r.e > r.s then r.e - r.s else r.e - r.s + interval '24 hours' end) as end_at
    from raw r
  ),
  found as (
    select s.employee_id, s.work_date, 'in'::text as kind, s.start_at as due_at
    from sched s
    left join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where v_enabled_in
      and w.id is null
      and v_now >= s.start_at + v_delay_in
      and s.start_at >= v_now - v_window
    union all
    select s.employee_id, s.work_date, 'out', s.end_at
    from sched s
    join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where v_enabled_out
      and w.end_time is null
      and v_now >= s.end_at + v_delay_out
      and s.end_at >= v_now - v_window
  ),
  inserted as (
    insert into punch_alerts (employee_id, work_date, kind)
    select employee_id, work_date, kind from found
    on conflict (employee_id, work_date, kind) do nothing
    returning employee_id, work_date, kind
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', coalesce(nullif(trim(e.nickname), ''), e.name),
        'work_date', to_char(i.work_date, 'YYYY-MM-DD'),
        'kind', i.kind,
        'due_at', to_char(f.due_at, 'HH24:MI')
      )
    ),
    '[]'::jsonb
  )
  into v_alerts
  from inserted i
  join employees e on e.id = i.employee_id
  join found f
    on f.employee_id = i.employee_id and f.work_date = i.work_date and f.kind = i.kind;

  if v_alerts = '[]'::jsonb then
    return jsonb_build_object('alerts', '[]'::jsonb, 'subscriptions', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)
    ),
    '[]'::jsonb
  )
  into v_subs
  from push_subscriptions ps
  join employees e on e.id = ps.employee_id
  where e.is_admin and e.status = 'active';

  return jsonb_build_object('alerts', v_alerts, 'subscriptions', v_subs);
end;
$$;

-- カレンダー購読: 枠の定義を適用開始日つきで返す（slot_versions）。
-- slots（app_settings の旧キー）はデプロイ切替中の旧コード用に残す
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select f.employee_id into v_emp
  from calendar_feeds f
  join employees e on e.id = f.employee_id
  where f.token = p_token and e.status = 'active';

  if v_emp is null then
    return null;
  end if;

  return jsonb_build_object(
    'employee_id', v_emp,
    'company_name', (select value from app_settings where key = 'company_name'),
    'slots', coalesce(
      (select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value))
       from app_settings s where s.key like 'shift\_slot\_%'),
      '[]'::jsonb
    ),
    'slot_versions', coalesce(
      (select jsonb_agg(jsonb_build_object('effective_from', w.effective_from, 'key', w.key, 'value', w.value))
       from work_time_settings w where w.key like 'shift\_slot\_%'),
      '[]'::jsonb
    ),
    'shifts', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'work_date', sa.work_date,
           'slot', sa.slot,
           'custom_start', sa.custom_start,
           'custom_end', sa.custom_end,
           'draft', is_shift_draft(sa.work_date)
         ) order by sa.work_date)
       from shift_assignments sa
       where sa.employee_id = v_emp
         and sa.work_date >= ((now() at time zone 'Asia/Tokyo')::date - 62)),
      '[]'::jsonb
    )
  );
end;
$$;
