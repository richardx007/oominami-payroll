-- 営業カレンダー（フェーズ5: 毎月15日の自動作成と管理者への通知）
-- 2026-09-18: docs/business-calendar-plan.md §6.3
--
-- 未打刻通知・初回ログイン通知と同じ設計: 判定・作成・送信先の解決は DB、
-- API(/api/notify/business-calendar) は Web Push の暗号化と送信だけ（service_role キーを持たない方針）。
--
-- ⚠️ このファイルは「何を設定したか」の記録。**復元時は Vault への URL 登録と cron 登録が必要**（末尾参照）。

create or replace function public.create_business_month_if_due(p_today date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  -- 15日より前は何もしない
  if extract(day from v_today) < 15 then
    return jsonb_build_object('action', 'not_due', 'target', v_target);
  end if;

  if not exists (select 1 from business_months where ym = v_target) then
    begin
      perform generate_business_month(v_target);
      v_kind := 'created';
      insert into activity_logs (actor_id, actor_name, action, detail)
      values (null, 'システム(自動)', '営業カレンダー作成',
              format('%s年%s月分（自動作成）', extract(year from v_target), extract(month from v_target)));
    exception when others then
      -- 祝日データが無いなど。前日までの状態を残し、翌日また試す
      v_kind := 'failed';
      v_error := sqlerrm;
      insert into activity_logs (actor_id, actor_name, action, detail)
      values (null, 'システム(自動)', '営業カレンダー自動作成失敗', left(v_error, 1000));
    end;
  end if;

  select * into v_month from business_months where ym = v_target;

  -- 通知対象: 今回の失敗、または自動作成した月でまだ通知していないもの（Vault 未設定などで送れなかった分の再試行を含む）。
  -- 管理者が「今すぐ作成」した月（generated_by あり）には通知しない。
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
    -- オフの間に作成した月は、後でオンにしても通知しない
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
$$;

comment on function public.create_business_month_if_due(date) is
  'pg_cron から毎日呼ぶ。JSTで15日以降かつ翌々月が未作成なら定義から作成し、管理者へ通知(1回だけ)。p_today はテスト用。';

revoke all on function public.create_business_month_if_due(date) from public, anon, authenticated;

-- pg_cron は UTC。12:00 JST = 03:00 UTC（通知を日中に受けたいオーナー要望。当初 03:00 JST で登録し、2026-09-17 に cron.alter_job で変更）
select cron.unschedule(jobid) from cron.job where jobname = 'business-calendar-auto';
select cron.schedule('business-calendar-auto', '0 3 * * *', $job$select public.create_business_month_if_due();$job$);

-- ============================================================
-- 復元手順(DR復旧時・新環境構築時)
-- ============================================================
-- select vault.create_secret(
--   'https://<デプロイ先>/api/notify/business-calendar',
--   'notify_business_calendar_url',
--   '営業カレンダー作成通知APIのURL'
-- );
-- (notify_secret は未打刻通知の Vault 登録を共用するため、別途登録不要)
--
-- select cron.schedule('business-calendar-auto', '0 3 * * *', $job$select public.create_business_month_if_due();$job$);
