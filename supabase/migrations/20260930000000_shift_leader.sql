-- 権限「リーダ」と「シフト変更通知」を追加する。
--
-- リーダ: ベースは従業員と同じ。加えて
--   - 他の従業員のシフト予定を直接変更できる(確定済みの月も可)
--   - シフトの月の「調整中 ⇔ 確定」を切り替えられる
--   ※本人がかけた「変更不可」ロックは管理者と同じく尊重する(ロック中の他人の日は変更不可)。
--
-- シフト予定の変更はすべてトリガーで操作ログ(activity_logs)に残す(従来は記録していなかった)。
--
-- シフト変更通知: 確定済みの月に、本人以外(リーダ・管理者)が本人のシフトを変えたら本人の端末へ通知する。
--   連続した変更(枠→変則出勤→変則退勤 など)で通知が何通も飛ばないよう、変更をキューに貯め、
--   その人への最後の変更から2分たったら1通にまとめて送る(pg_cron 毎分)。

-- ============================================================
-- 1. 権限
-- ============================================================
alter table public.employees
  add column is_leader boolean not null default false,
  add constraint employees_leader_not_admin check (not (is_admin and is_leader));

comment on column public.employees.is_leader is
  'リーダ権限(従業員のみ)。他の従業員のシフトを確定月でも変更でき、シフトの調整中/確定を切り替えられる。';

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and is_leader = true and status = 'active'
  );
$$;

-- シフト表の対象(在籍中の従業員。管理者は対象外)か。RLS から employees を読むために DEFINER にする
create or replace function public.is_shift_member(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from employees
    where id = p_employee_id and is_admin = false and status = 'active'
  );
$$;

-- リーダ: シフト表の対象者の予定を月のモードに関わらず変更できる。
-- 他人がロックした日は変更できない(自分のロックは自分の意思表示なので動かせてよい)。
create policy shift_assignments_leader on public.shift_assignments
  for all
  using (
    public.is_leader()
    and public.is_shift_member(employee_id)
    and (employee_id = public.current_employee_id()
         or not public.is_shift_locked(employee_id, work_date))
  )
  with check (
    public.is_leader()
    and public.is_shift_member(employee_id)
    and (employee_id = public.current_employee_id()
         or not public.is_shift_locked(employee_id, work_date))
  );

-- リーダ: 月のモード(調整中/確定)を切り替えられる
create policy shift_modes_leader_insert on public.shift_modes
  for insert with check (public.is_leader());
create policy shift_modes_leader_update on public.shift_modes
  for update using (public.is_leader()) with check (public.is_leader());

-- ============================================================
-- 2. シフト変更通知の本人設定(既定はオン)
-- ============================================================
alter table public.shift_reminder_settings
  add column shift_change boolean,
  drop constraint shift_reminder_settings_any,
  add constraint shift_reminder_settings_any
    check (minutes_before is not null or end_minutes_before is not null or shift_change is not null);

comment on column public.shift_reminder_settings.shift_change is
  '確定月のシフトを他人(リーダ・管理者)に変更されたときに通知するか。null(または行が無い) = する。';

-- ============================================================
-- 3. 変更通知のキュー
-- ============================================================
create table public.shift_change_notices (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  before_text text not null, -- 変更前(例: 早番 / 遅番(10:00〜) / なし)
  after_text text not null,
  actor_name text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create index shift_change_notices_pending on public.shift_change_notices (employee_id)
  where notified_at is null;

comment on table public.shift_change_notices is
  'シフト変更通知のキュー(トリガーで追加)。最後の変更から2分後に本人ごと1通にまとめて送り notified_at を入れる。管理者だけが読める。';

alter table public.shift_change_notices enable row level security;

create policy shift_change_notices_admin_read on public.shift_change_notices
  for select using (public.is_admin());

grant select on public.shift_change_notices to authenticated;

-- ============================================================
-- 4. 変更トリガー(操作ログ + 変更通知のキュー)
-- ============================================================
-- 表示用: "早番" / "早番(10:00〜18:00)" / "なし"
create or replace function public.shift_text(p_date date, p_slot text, p_start text, p_end text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_slot is null then 'なし'
    else coalesce(nullif(trim(work_setting_at(p_date, 'shift_slot_' || lower(p_slot) || '_label')), ''), p_slot)
      || case
           when nullif(trim(p_start), '') is null and nullif(trim(p_end), '') is null then ''
           else '(' || coalesce(nullif(trim(p_start), ''), '') || '〜' || coalesce(nullif(trim(p_end), ''), '') || ')'
         end
  end;
$$;

create or replace function public.shift_assignments_on_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_emp uuid := coalesce(new.employee_id, old.employee_id);
  v_date date := coalesce(new.work_date, old.work_date);
  v_actor_id uuid;
  v_actor_name text;
  v_target_name text;
  v_before text;
  v_after text;
  v_confirmed boolean;
begin
  -- 中身が変わらない上書き(同じ値での保存)は記録しない
  if tg_op = 'UPDATE'
     and new.slot is not distinct from old.slot
     and new.custom_start is not distinct from old.custom_start
     and new.custom_end is not distinct from old.custom_end
     and new.work_date = old.work_date
     and new.employee_id = old.employee_id then
    return null;
  end if;

  -- アプリからの操作だけを対象にする(SQL での保守作業などログイン者のいない変更は除く)
  select e.id, coalesce(nullif(trim(e.nickname), ''), e.name) into v_actor_id, v_actor_name
  from employees e where e.auth_user_id = auth.uid();
  if v_actor_id is null then
    return null;
  end if;

  -- 従業員の削除に伴う連鎖削除では記録・通知しない(本人の行がもう無い)
  select coalesce(nullif(trim(e.nickname), ''), e.name) into v_target_name
  from employees e where e.id = v_emp;
  if v_target_name is null then
    return null;
  end if;

  v_before := case when tg_op = 'INSERT' then 'なし'
                   else shift_text(old.work_date, old.slot, old.custom_start, old.custom_end) end;
  v_after := case when tg_op = 'DELETE' then 'なし'
                  else shift_text(new.work_date, new.slot, new.custom_start, new.custom_end) end;
  v_confirmed := not is_shift_draft(v_date);

  perform log_activity(
    'シフト',
    format('%s %s: %s → %s%s', to_char(v_date, 'YYYY-MM-DD'), v_target_name, v_before, v_after,
           case when v_confirmed then '(確定月)' else '' end)
  );

  -- 確定月に本人以外が変更した → 本人に通知(本人が通知をオフにしていなければ)
  if v_confirmed
     and v_actor_id <> v_emp
     and coalesce((select s.shift_change from shift_reminder_settings s where s.employee_id = v_emp), true) then
    insert into shift_change_notices (employee_id, work_date, before_text, after_text, actor_name)
    values (v_emp, v_date, v_before, v_after, v_actor_name);
  end if;

  return null;
end;
$$;

create trigger shift_assignments_on_change
  after insert or update or delete on public.shift_assignments
  for each row execute function public.shift_assignments_on_change();

-- ============================================================
-- 5. 送信ペイロードの組み立て(最後の変更から2分たった人だけ)
-- ============================================================
create or replace function public.collect_shift_change_notices()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_notices jsonb;
begin
  if not exists (select 1 from shift_change_notices where notified_at is null) then
    return jsonb_build_object('notices', '[]'::jsonb);
  end if;

  with ready as (
    select employee_id
    from shift_change_notices
    where notified_at is null
    group by employee_id
    having max(created_at) <= now() - interval '2 minutes'
  ),
  taken as (
    update shift_change_notices n
    set notified_at = now()
    from ready r
    where n.employee_id = r.employee_id and n.notified_at is null
    returning n.*
  ),
  -- 同じ日を何度か変えた場合は「最初の変更前 → 最後の変更後」にまとめ、元に戻っていれば送らない
  per_day as (
    select
      employee_id,
      work_date,
      (array_agg(before_text order by id))[1] as before_text,
      (array_agg(after_text order by id desc))[1] as after_text
    from taken
    group by employee_id, work_date
  ),
  per_emp as (
    select
      d.employee_id,
      jsonb_agg(
        jsonb_build_object('date', to_char(d.work_date, 'FMMM/FMDD'), 'before', d.before_text, 'after', d.after_text)
        order by d.work_date
      ) as changes
    from per_day d
    where d.before_text <> d.after_text
    group by d.employee_id
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb)
  into v_notices
  from (
    select jsonb_build_object(
      'changes', p.changes,
      'actors', (select jsonb_agg(distinct t.actor_name) from taken t where t.employee_id = p.employee_id),
      'subscriptions', (
        select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
        from push_subscriptions ps
        where ps.employee_id = p.employee_id
      )
    ) as x
    from per_emp p
    join employees e on e.id = p.employee_id and e.status = 'active'
    -- 通知を許可した端末が無い人は送らない(送信済みにはしておき、繰り返し検出しない)
    where exists (select 1 from push_subscriptions ps where ps.employee_id = p.employee_id)
  ) t;

  -- 古い送信済み記録の掃除(90日)
  delete from shift_change_notices where notified_at < now() - interval '90 days';

  return jsonb_build_object('notices', v_notices);
end;
$$;

comment on function public.collect_shift_change_notices() is
  'シフト変更通知の対象(最後の変更から2分たった人)をまとめ、送信済みにしたうえで Web Push 用のペイロードを返す。pg_cron から呼ぶ。';

revoke all on function public.collect_shift_change_notices() from public;

-- ============================================================
-- 6. cron ジョブ本体(送信先はシフト通知と同じく notify_url から組み立てる)
-- ============================================================
create or replace function public.run_shift_change_notice_job()
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
  v_payload := public.collect_shift_change_notices();

  if jsonb_array_length(v_payload->'notices') = 0 then
    return;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  select regexp_replace(decrypted_secret, '/api/notify/punch/?$', '/api/notify/shift-change')
    into v_url
  from vault.decrypted_secrets where name = 'notify_url';

  if v_secret is null or v_url is null then
    raise warning 'シフト変更通知: Vault に notify_secret / notify_url がありません';
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

comment on function public.run_shift_change_notice_job() is
  'pg_cron から毎分呼ぶシフト変更通知ジョブ。送るものがある時だけ API へ POST する。';

revoke all on function public.run_shift_change_notice_job() from public;

select cron.schedule('shift-change-notices', '* * * * *', $job$select public.run_shift_change_notice_job();$job$);
