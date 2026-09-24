-- 遅番の終了時刻を「翌日まで通しの日」と「それ以外の日」で分けて持つ
-- 2026-09-24: 10/1 から、遅番が 23:00 までになるのは「翌日まで通し」ではない日。
--
-- work_time_settings に shift_slot_b_end_overnight（翌日まで通しの日の終了）を追加する。
-- 既存の shift_slot_b_end は「それ以外の日」の終了。既存の定義は両方同じ値（=今までどおり）にする。
-- 「翌日まで通しの日」かどうかは is_overnight_day()（営業カレンダー business_days。未作成の月は営業時間の定義）で決める。
-- ※TS側 src/lib/shifts.ts の slotsForDay() と src/lib/work-time.ts が同じ規則を持つ。**片方だけ変えないこと。**

alter table public.work_time_settings drop constraint if exists work_time_settings_key_check;
alter table public.work_time_settings add constraint work_time_settings_key_check
  check (key ~ '^(shift_slot_[abc]_(label|start|end)|shift_slot_b_end_overnight|break_window_[123]_(start|end))$');

insert into public.work_time_settings (effective_from, key, value)
select effective_from, 'shift_slot_b_end_overnight', value
from public.work_time_settings
where key = 'shift_slot_b_end'
on conflict (effective_from, key) do nothing;

-- その日が「翌日まで通し」の営業日か。営業カレンダーの日（手で直した日を含む）を優先し、
-- まだ作っていない月は営業時間の定義（区分×適用開始日）で判定する
create or replace function public.is_overnight_day(p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select status = 'open' and overnight from business_days where date = p_date),
    (select is_open and overnight from business_hour_patterns
     where day_type = business_day_type(p_date) and effective_from <= p_date
     order by effective_from desc limit 1),
    false
  );
$$;

revoke all on function public.is_overnight_day(date) from public, anon;
grant execute on function public.is_overnight_day(date) to authenticated;

-- 期間内の「翌日まで通し」の日（画面側で遅番の終了を決めるため）
create or replace function public.overnight_days(p_start date, p_end date)
returns setof date
language sql
stable
security definer
set search_path = public
as $$
  select d::date from generate_series(p_start, p_end, interval '1 day') d
  where p_end - p_start <= 400 and is_overnight_day(d::date);
$$;

revoke all on function public.overnight_days(date, date) from public, anon;
grant execute on function public.overnight_days(date, date) to authenticated;

-- 枠の既定の終了時刻（その日の定義。遅番は翌日まで通しの日なら shift_slot_b_end_overnight）
create or replace function public.slot_end_at(p_date date, p_slot text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_slot = 'B' and is_overnight_day(p_date)
      then coalesce(work_setting_at(p_date, 'shift_slot_b_end_overnight'), work_setting_at(p_date, 'shift_slot_b_end'))
    else work_setting_at(p_date, 'shift_slot_' || lower(p_slot) || '_end')
  end;
$$;

revoke all on function public.slot_end_at(date, text) from public, anon;
grant execute on function public.slot_end_at(date, text) to authenticated;

-- シフト予実の突き合わせ（終了は slot_end_at。それ以外は 20260924081448 と同じ）
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
               norm_hhmm(slot_end_at(sa.work_date, sa.slot))) pe
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

-- 未打刻通知（終了は slot_end_at。それ以外は 20260924081448 と同じ）
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
               parse_slot_time(slot_end_at(sa.work_date, sa.slot)),
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

-- カレンダー購読: 各シフトに「翌日まで通しの日か」（overnight）を付ける（それ以外は 20260924081448 と同じ）
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
           'draft', is_shift_draft(sa.work_date),
           'overnight', is_overnight_day(sa.work_date)
         ) order by sa.work_date)
       from shift_assignments sa
       where sa.employee_id = v_emp
         and sa.work_date >= ((now() at time zone 'Asia/Tokyo')::date - 62)),
      '[]'::jsonb
    )
  );
end;
$$;
