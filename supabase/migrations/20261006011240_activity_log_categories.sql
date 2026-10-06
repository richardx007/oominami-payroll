-- 操作ログのカテゴリ整理(2026-10-06)
-- - 営業カレンダー〜 は「営業カレンダー」、営業と勤務時間〜/営業時間の定義〜 は「営業・勤務時間」、
--   アプリの解説を追加/変更/削除 は「アプリの解説」、時給変更/昼食補助変更 は「給与設定」に集約し、
--   何をしたかは詳細の先頭(「作成: 」「変更: 」など)に書く。
-- - 圏外打刻 → 打刻拒否、打刻画面 → 打刻、プロフィール更新 → プロフィール、
--   レシートのバックアップ → バックアップ、notify_settings_update → 通知設定。
-- - 未ログインで送るメール(初回登録の確認・パスワード再設定の本人申請)はシステムの自動送信なので、実行者を「システム」にする。
-- - シフトが「調整中」の月のシフト変更は記録しない(モードの切り替えはアプリ側で常に記録する)。
-- 既存のログも新しいカテゴリに書き換える(カテゴリで絞り込んだときに過去分も出るように)。

-- ---- 操作ログの記録 ----
create or replace function public.log_activity(p_action text, p_detail text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_name text;
  v_deleted integer;
  v_recent_anon integer;
begin
  select e.id, coalesce(nullif(trim(e.nickname), ''), e.name) into v_id, v_name
  from public.employees e
  where e.auth_user_id = auth.uid();

  if v_id is null then
    select count(*) into v_recent_anon
    from public.activity_logs
    where actor_id is null
      and created_at > now() - interval '1 minute';

    if v_recent_anon >= 20 then
      return;
    end if;
  end if;

  -- 未ログインでのメール送信(初回登録の確認・パスワード再設定の本人申請)はシステムの自動送信として記録する
  insert into public.activity_logs (actor_id, actor_name, action, detail)
  values (v_id,
          coalesce(v_name, case when p_action = 'メール送信' then 'システム' else '(未ログイン)' end),
          p_action, left(p_detail, 1000));

  -- 保持期間(90日)より古いログを削除。削除が発生したらその件数を記録する。
  if random() < 0.05 then
    delete from public.activity_logs
    where created_at < now() - interval '90 days';
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then
      insert into public.activity_logs (actor_id, actor_name, action, detail)
      values (
        null,
        'システム(自動)',
        'ログ削除',
        format('保持期間(90日)超過のログを%s件削除しました', v_deleted)
      );
    end if;
  end if;
end;
$function$;

-- ---- 営業カレンダーの作成・作り直し ----
create or replace function public.generate_business_month(p_ym date, p_regenerate boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ym date := date_trunc('month', p_ym)::date;
  v_end date := (date_trunc('month', p_ym) + interval '1 month - 1 day')::date;
  v_by uuid := null;
  v_count int;
begin
  if auth.uid() is not null then
    if not is_admin() then
      raise exception '管理者のみ実行できます';
    end if;
    v_by := current_employee_id();
  end if;

  if not p_regenerate and exists (select 1 from business_months where ym = v_ym) then
    raise exception '%年%月分は作成済みです', extract(year from v_ym), extract(month from v_ym);
  end if;

  if not exists (select 1 from jp_holidays
                 where date >= date_trunc('year', v_ym)
                   and date < date_trunc('year', v_ym) + interval '1 year')
     or not exists (select 1 from jp_holidays
                    where date >= date_trunc('year', v_end + 1)
                      and date < date_trunc('year', v_end + 1) + interval '1 year') then
    raise exception '祝日データを取得できていません（%年%月分の作成を中止しました）',
      extract(year from v_ym), extract(month from v_ym);
  end if;

  with src as (
    select d::date as date, business_day_type(d::date) as day_type
    from generate_series(v_ym, v_end, interval '1 day') d
  )
  insert into business_days
    (date, day_type, holiday_name, status, open_min, close_min, overnight, is_manual, updated_at, updated_by)
  select s.date, s.day_type, h.name,
         case when p.is_open then 'open' else 'closed' end,
         case when p.is_open then p.open_min end,
         case when p.is_open and not p.overnight then p.close_min end,
         p.is_open and p.overnight,
         false, now(), v_by
  from src s
  join lateral (
    select * from business_hour_patterns bp
    where bp.day_type = s.day_type and bp.effective_from <= s.date
    order by bp.effective_from desc
    limit 1
  ) p on true
  left join jp_holidays h on h.date = s.date
  on conflict (date) do update set
    holiday_name = excluded.holiday_name,
    day_type   = case when business_days.is_manual then business_days.day_type  else excluded.day_type  end,
    status     = case when business_days.is_manual then business_days.status    else excluded.status    end,
    open_min   = case when business_days.is_manual then business_days.open_min  else excluded.open_min  end,
    close_min  = case when business_days.is_manual then business_days.close_min else excluded.close_min end,
    overnight  = case when business_days.is_manual then business_days.overnight else excluded.overnight end,
    updated_at = case when business_days.is_manual then business_days.updated_at else excluded.updated_at end,
    updated_by = case when business_days.is_manual then business_days.updated_by else excluded.updated_by end;
  get diagnostics v_count = row_count;

  insert into business_months (ym, generated_at, generated_by)
  values (v_ym, now(), v_by)
  on conflict (ym) do update set generated_at = excluded.generated_at, generated_by = excluded.generated_by;

  if v_by is not null then
    perform log_activity(
      '営業カレンダー',
      format('%s: %s年%s月分', case when p_regenerate then '作り直し' else '作成' end,
             extract(year from v_ym), extract(month from v_ym))
    );
  end if;

  return v_count;
end;
$function$;

-- ---- 営業カレンダーの注釈 ----
create or replace function public.set_business_month_footnote(p_ym date, p_footnote text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ym date := date_trunc('month', p_ym)::date;
  v_note text := nullif(trim(p_footnote), '');
begin
  if not is_admin() then
    raise exception '管理者のみ実行できます';
  end if;

  update business_months set footnote = v_note where ym = v_ym;
  if not found then
    raise exception '%年%月分はまだ作成されていません', extract(year from v_ym), extract(month from v_ym);
  end if;

  perform log_activity(
    '営業カレンダー',
    format('注釈を変更: %s年%s月分: %s', extract(year from v_ym), extract(month from v_ym), coalesce(v_note, '（なし）'))
  );
end;
$function$;

-- ---- 営業カレンダーの自動作成(毎月15日) ----
create or replace function public.create_business_month_if_due(p_today date default null::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Tokyo')::date);
  v_target date := (date_trunc('month', v_today) + interval '2 month')::date;
  v_kind text := null;
  v_error text := null;
  v_month business_months%rowtype;
  v_enabled boolean;
  v_subs jsonb;
  v_secret text;
  v_url text;
begin
  if extract(day from v_today) < 15 then
    return jsonb_build_object('action', 'not_due', 'target', v_target);
  end if;

  if not exists (select 1 from business_months where ym = v_target) then
    begin
      perform generate_business_month(v_target);
      v_kind := 'created';
      insert into activity_logs (actor_id, actor_name, action, detail)
      values (null, 'システム(自動)', '営業カレンダー',
              format('作成: %s年%s月分（自動作成）', extract(year from v_target), extract(month from v_target)));
    exception when others then
      v_kind := 'failed';
      v_error := sqlerrm;
      insert into activity_logs (actor_id, actor_name, action, detail)
      values (null, 'システム(自動)', '営業カレンダー', left('自動作成に失敗: ' || v_error, 1000));
    end;
  end if;

  select * into v_month from business_months where ym = v_target;

  if v_kind is null then
    if v_month.ym is not null and v_month.generated_by is null and v_month.notified_at is null then
      v_kind := 'created';
    else
      return jsonb_build_object('action', 'none', 'target', v_target);
    end if;
  end if;

  select coalesce((select value <> 'false' from app_settings where key = 'notify_business_calendar'), true)
    into v_enabled;

  if not v_enabled then
    update business_months set notified_at = now() where ym = v_target and notified_at is null;
    return jsonb_build_object('action', v_kind, 'target', v_target, 'notified', false, 'reason', 'disabled', 'error', v_error);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)),
    '[]'::jsonb
  )
  into v_subs
  from push_subscriptions ps
  join employees e on e.id = ps.employee_id
  where e.is_admin and e.status = 'active';

  if jsonb_array_length(v_subs) = 0 then
    update business_months set notified_at = now() where ym = v_target and notified_at is null;
    return jsonb_build_object('action', v_kind, 'target', v_target, 'notified', false, 'reason', 'no_subscriptions', 'error', v_error);
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_business_calendar_url';

  if v_secret is null or v_url is null then
    raise warning '営業カレンダー通知: Vault に notify_secret / notify_business_calendar_url がありません';
    return jsonb_build_object('action', v_kind, 'target', v_target, 'notified', false, 'reason', 'vault_missing', 'error', v_error);
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object(
      'kind', v_kind,
      'ym', to_char(v_target, 'YYYY-MM'),
      'subscriptions', v_subs
    ),
    timeout_milliseconds := 15000
  );

  if v_kind = 'created' then
    update business_months set notified_at = now() where ym = v_target;
  end if;

  return jsonb_build_object('action', v_kind, 'target', v_target, 'notified', true, 'error', v_error);
end;
$function$;

-- ---- シフト予定の変更(調整中の月は記録しない) ----
create or replace function public.shift_assignments_on_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_emp uuid := coalesce(new.employee_id, old.employee_id);
  v_date date := coalesce(new.work_date, old.work_date);
  v_actor_id uuid;
  v_actor_name text;
  v_target_name text;
  v_before text;
  v_after text;
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

  -- 調整中の月は希望の出し入れが多いので記録・通知しない(確定月だけ)
  if is_shift_draft(v_date) then
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

  perform log_activity(
    'シフト',
    format('%s %s: %s → %s', to_char(v_date, 'YYYY-MM-DD'), v_target_name, v_before, v_after)
  );

  -- 本人以外が変更した → 本人に通知(本人が通知をオフにしていなければ)
  if v_actor_id <> v_emp
     and coalesce((select s.shift_change from shift_reminder_settings s where s.employee_id = v_emp), true) then
    insert into shift_change_notices (employee_id, work_date, before_text, after_text, actor_name)
    values (v_emp, v_date, v_before, v_after, v_actor_name);
  end if;

  return null;
end;
$function$;

-- ---- 既存ログの書き換え ----
update public.activity_logs set action = '通知設定' where action = 'notify_settings_update';
update public.activity_logs set action = 'バックアップ' where action = 'レシートのバックアップ';
update public.activity_logs set action = '打刻拒否' where action = '圏外打刻';
update public.activity_logs set action = '打刻' where action = '打刻画面';
update public.activity_logs set action = 'プロフィール' where action = 'プロフィール更新';
update public.activity_logs set action = '給与設定' where action in ('時給変更', '昼食補助変更');

update public.activity_logs
set detail = m.prefix || coalesce(detail, ''), action = m.new_action
from (values
  ('アプリの解説を追加', 'アプリの解説', '追加: '),
  ('アプリの解説を変更', 'アプリの解説', '変更: '),
  ('アプリの解説を削除', 'アプリの解説', '削除: '),
  ('営業カレンダー作成', '営業カレンダー', '作成: '),
  ('営業カレンダー作り直し', '営業カレンダー', '作り直し: '),
  ('営業カレンダー変更', '営業カレンダー', '変更: '),
  ('営業カレンダーの注釈を変更', '営業カレンダー', '注釈を変更: '),
  ('営業カレンダーのイベント追加', '営業カレンダー', 'イベントを追加: '),
  ('営業カレンダーのイベント変更', '営業カレンダー', 'イベントを変更: '),
  ('営業カレンダーのイベント削除', '営業カレンダー', 'イベントを削除: '),
  ('営業カレンダー自動作成失敗', '営業カレンダー', '自動作成に失敗: '),
  ('営業と勤務時間を変更', '営業・勤務時間', '変更: '),
  ('営業と勤務時間を削除', '営業・勤務時間', '削除: '),
  ('営業時間の定義を変更', '営業・勤務時間', '営業時間の定義を変更: ')
) as m(old_action, new_action, prefix)
where activity_logs.action = m.old_action;

update public.activity_logs set actor_name = 'システム'
where actor_id is null and actor_name = '(未ログイン)' and action = 'メール送信';
