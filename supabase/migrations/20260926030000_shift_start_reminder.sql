-- 従業員向け「シフト開始の N 分前に通知」(Web Push)。
--
-- 構成は未打刻通知(20260804060000_push_notifications.sql)と同じ:
--   pg_cron → collect_shift_reminders() が「送るべき通知」と「送信先(本人の端末)」を組み立て
--   → 送るものがある時だけ /api/notify/shift-reminder へ POST → API は暗号化と送信だけ。
--
-- 対象: 確定済みの月のシフトだけ(調整中＝希望の段階では通知しない)。
--       既に出勤打刻がある日は通知しない。

-- ============================================================
-- 1. 本人の設定(行が無い = 通知しない)
-- ============================================================
create table if not exists public.shift_reminder_settings (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  minutes_before int not null check (minutes_before between 5 and 720),
  updated_at timestamptz not null default now()
);

comment on table public.shift_reminder_settings is
  'シフト開始前通知の本人設定。行があれば、確定シフトの開始 minutes_before 分前に本人の端末へ通知する。';

alter table public.shift_reminder_settings enable row level security;

create policy shift_reminder_settings_self on public.shift_reminder_settings
  for all
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

grant select, insert, update, delete on public.shift_reminder_settings to authenticated;

-- ============================================================
-- 2. 送信済みの記録(重複防止)
-- ============================================================
-- 開始時刻(start_at)まで含めて主キーにする。通知後にシフトの時刻が変わった場合は、
-- 新しい開始時刻であらためて通知する。
create table if not exists public.shift_reminders (
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  start_at timestamp not null, -- 日本時間
  notified_at timestamptz not null default now(),
  primary key (employee_id, work_date, start_at)
);

comment on table public.shift_reminders is
  'シフト開始前通知の送信済み記録。(従業員, 業務日, 開始日時)で重複送信を防ぐ。';

alter table public.shift_reminders enable row level security;

create policy shift_reminders_admin_read on public.shift_reminders
  for select using (public.is_admin());

grant select on public.shift_reminders to authenticated;

-- ============================================================
-- 3. 通知対象の検出 + 送信済み記録 + 送信ペイロード組み立て
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
  -- 設定している人が1人もいなければ何もしない(大半の実行はここで終わる)
  if not exists (select 1 from shift_reminder_settings) then
    return jsonb_build_object('reminders', '[]'::jsonb);
  end if;

  -- 開始日時の求め方は collect_punch_alerts() と同じ(個別時刻 > その日の枠設定 > 既定値)
  with slot_default(slot, s) as (
    values ('A'::text, interval '8 hours'),
           ('B', interval '15 hours'),
           ('C', interval '0 hours')
  ),
  raw as (
    select
      sa.employee_id,
      sa.work_date,
      rs.minutes_before,
      coalesce(parse_slot_time(nullif(trim(sa.custom_start), '')),
               parse_slot_time(work_setting_at(sa.work_date, 'shift_slot_' || lower(sa.slot) || '_start')),
               sd.s) as s
    from shift_assignments sa
    join shift_reminder_settings rs on rs.employee_id = sa.employee_id
    join employees e on e.id = sa.employee_id and e.status = 'active'
    join slot_default sd on sd.slot = sa.slot
    where sa.work_date between (v_now::date - 1) and (v_now::date + 1)
      and not is_shift_draft(sa.work_date)
  ),
  sched as (
    select
      r.employee_id,
      r.work_date,
      r.minutes_before,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end) as start_at
    from raw r
  ),
  found as (
    select s.*
    from sched s
    left join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where w.id is null
      and v_now >= s.start_at - make_interval(mins => s.minutes_before)
      and v_now < s.start_at
  ),
  inserted as (
    insert into shift_reminders (employee_id, work_date, start_at)
    select employee_id, work_date, start_at from found
    on conflict do nothing
    returning employee_id, work_date, start_at
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb)
  into v_reminders
  from (
    select jsonb_build_object(
      'start', to_char(i.start_at, 'HH24:MI'),
      'date', to_char(i.start_at, 'FMMM/FMDD'),
      -- 実際の残り分数(設定を変えた直後などは設定値より短いことがある)
      'minutes_left', ceil(extract(epoch from (i.start_at - v_now)) / 60)::int,
      'subscriptions', (
        select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
        from push_subscriptions ps
        where ps.employee_id = i.employee_id
      )
    ) as x
    from inserted i
    -- 通知を許可した端末が無い人は送らない(記録だけ残して繰り返し検出しない)
    where exists (select 1 from push_subscriptions ps where ps.employee_id = i.employee_id)
  ) t;

  return jsonb_build_object('reminders', v_reminders);
end;
$$;

comment on function public.collect_shift_reminders() is
  'シフト開始前通知の対象を検出し、送信済みとして記録したうえで Web Push 送信用のペイロードを返す。pg_cron から呼ぶ。';

revoke all on function public.collect_shift_reminders() from public;

-- ============================================================
-- 4. cron ジョブ本体
-- ============================================================
-- 送信先 URL は Vault の notify_shift_reminder_url を優先し、無ければ未打刻通知の
-- notify_url(…/api/notify/punch)から組み立てる(Vault の追加登録なしで動かすため)。
create or replace function public.run_shift_reminder_job()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payload jsonb;
  v_secret text;
  v_url text;
begin
  v_payload := public.collect_shift_reminders();

  if jsonb_array_length(v_payload->'reminders') = 0 then
    return;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_shift_reminder_url';
  if v_url is null then
    select regexp_replace(decrypted_secret, '/api/notify/punch/?$', '/api/notify/shift-reminder')
      into v_url
    from vault.decrypted_secrets where name = 'notify_url';
  end if;

  if v_secret is null or v_url is null then
    raise warning 'シフト開始前通知: Vault に notify_secret / notify_url がありません';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := v_payload,
    timeout_milliseconds := 15000
  );
end;
$$;

comment on function public.run_shift_reminder_job() is
  'pg_cron から毎分呼ぶシフト開始前通知ジョブ。通知がある時だけ API へ POST する。';

revoke all on function public.run_shift_reminder_job() from public;

-- 毎分実行(「N分前」のずれを1分以内にするため)。対象が無ければ SQL だけで終わり、
-- Cloudflare Worker は起こさない。
select cron.schedule('shift-reminders', '* * * * *', $job$select public.run_shift_reminder_job();$job$);
