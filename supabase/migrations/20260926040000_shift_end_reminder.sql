-- 従業員向け「シフト終了時間の N 分前に通知」を追加する(20260926030000_shift_start_reminder.sql の拡張)。
-- N にマイナスを入れると「終了の |N| 分後」に通知する(退勤打刻の忘れ防止)。
--
-- 終了通知の対象: 確定済みの月のシフトで、出勤打刻済み・退勤打刻がまだの日だけ。
-- 開始通知と違い「予定時刻から10分以内」に限って送る(マイナス値で終了後に送るため、
-- 設定を後から変えた時に何時間も前のシフトへ通知が飛ぶのを防ぐ)。

-- ============================================================
-- 1. 設定: 開始/終了を別々にオン/オフ(両方オフなら行を消す)
-- ============================================================
alter table public.shift_reminder_settings
  alter column minutes_before drop not null,
  add column end_minutes_before int check (end_minutes_before between -720 and 720),
  add constraint shift_reminder_settings_any check (minutes_before is not null or end_minutes_before is not null);

comment on column public.shift_reminder_settings.minutes_before is
  'シフト開始の何分前に通知するか(5〜720)。null = 開始の通知はしない。';
comment on column public.shift_reminder_settings.end_minutes_before is
  'シフト終了の何分前に通知するか(-720〜720)。マイナスは終了の何分後。null = 終了の通知はしない。';
comment on table public.shift_reminder_settings is
  'シフト開始前/終了前後の通知の本人設定。行が無い = どちらも通知しない。';

-- ============================================================
-- 2. 送信済みの記録: 種類(開始/終了)を持たせる
-- ============================================================
alter table public.shift_reminders
  add column kind text not null default 'start' check (kind in ('start', 'end'));
alter table public.shift_reminders rename column start_at to target_at;
alter table public.shift_reminders drop constraint shift_reminders_pkey;
alter table public.shift_reminders add primary key (employee_id, work_date, kind, target_at);
alter table public.shift_reminders alter column kind drop default;

comment on column public.shift_reminders.target_at is '基準にしたシフトの開始/終了日時(日本時間)。';
comment on table public.shift_reminders is
  'シフト通知の送信済み記録。(従業員, 業務日, 種類, 基準日時)で重複送信を防ぐ。';

-- ============================================================
-- 3. 検出関数を開始・終了の両方に対応させる
-- ============================================================
create or replace function public.collect_shift_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_now timestamp := (now() at time zone 'Asia/Tokyo');
  v_reminders jsonb;
begin
  if not exists (select 1 from shift_reminder_settings) then
    return jsonb_build_object('reminders', '[]'::jsonb);
  end if;

  -- 開始/終了日時の求め方は collect_punch_alerts() と同じ
  with slot_default(slot, s, e) as (
    values ('A'::text, interval '8 hours', interval '17 hours'),
           ('B', interval '15 hours', interval '0 hours'),
           ('C', interval '0 hours', interval '9 hours')
  ),
  raw as (
    select
      sa.employee_id,
      sa.work_date,
      rs.minutes_before,
      rs.end_minutes_before,
      coalesce(parse_slot_time(nullif(trim(sa.custom_start), '')),
               parse_slot_time(work_setting_at(sa.work_date, 'shift_slot_' || lower(sa.slot) || '_start')),
               sd.s) as s,
      coalesce(parse_slot_time(nullif(trim(sa.custom_end), '')),
               parse_slot_time(slot_end_at(sa.work_date, sa.slot)),
               sd.e) as e
    from shift_assignments sa
    join shift_reminder_settings rs on rs.employee_id = sa.employee_id
    join employees e on e.id = sa.employee_id and e.status = 'active'
    join slot_default sd on sd.slot = sa.slot
    where sa.work_date between (v_now::date - 2) and (v_now::date + 1)
      and not is_shift_draft(sa.work_date)
  ),
  sched as (
    select
      r.employee_id,
      r.work_date,
      r.minutes_before,
      r.end_minutes_before,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end) as start_at,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end)
        + (case when r.e > r.s then r.e - r.s else r.e - r.s + interval '24 hours' end) as end_at
    from raw r
  ),
  found as (
    -- 開始の N 分前(出勤打刻がまだ・開始前まで)
    select s.employee_id, s.work_date, 'start'::text as kind, s.start_at as target_at
    from sched s
    left join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where s.minutes_before is not null
      and w.id is null
      and v_now >= s.start_at - make_interval(mins => s.minutes_before)
      and v_now < s.start_at
    union all
    -- 終了の N 分前(マイナスは N 分後)。出勤済み・退勤打刻がまだの日だけ、予定時刻から10分以内
    select s.employee_id, s.work_date, 'end', s.end_at
    from sched s
    join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where s.end_minutes_before is not null
      and w.end_time is null
      and v_now >= s.end_at - make_interval(mins => s.end_minutes_before)
      and v_now < s.end_at - make_interval(mins => s.end_minutes_before) + interval '10 minutes'
  ),
  inserted as (
    insert into shift_reminders (employee_id, work_date, kind, target_at)
    select employee_id, work_date, kind, target_at from found
    on conflict do nothing
    returning employee_id, work_date, kind, target_at
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb)
  into v_reminders
  from (
    select jsonb_build_object(
      'kind', i.kind,
      'time', to_char(i.target_at, 'HH24:MI'),
      'date', to_char(i.target_at, 'FMMM/FMDD'),
      -- 実際の残り分数(終了後はマイナス)
      'minutes_left', ceil(extract(epoch from (i.target_at - v_now)) / 60)::int,
      'subscriptions', (
        select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
        from push_subscriptions ps
        where ps.employee_id = i.employee_id
      )
    ) as x
    from inserted i
    where exists (select 1 from push_subscriptions ps where ps.employee_id = i.employee_id)
  ) t;

  return jsonb_build_object('reminders', v_reminders);
end;
$$;

revoke all on function public.collect_shift_reminders() from public;
