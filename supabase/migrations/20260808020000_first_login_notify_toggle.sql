-- 「新規従業員の初回ログイン」通知にオン/オフスイッチを追加。
-- 既定は有効(未設定時は送る)。オフの時はPush送信をスキップする。

create or replace function public.notify_first_login()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_name text;
  v_enabled boolean;
  v_secret text;
  v_url text;
  v_subs jsonb;
begin
  select coalesce(
    (select value <> 'false' from app_settings where key = 'notify_first_login'),
    true
  ) into v_enabled;

  if not v_enabled then
    return;
  end if;

  select e.id, coalesce(nullif(trim(e.nickname), ''), e.name) into v_id, v_name
  from employees e
  where e.id = current_employee_id();

  if v_id is null then
    raise exception '従業員が見つかりません';
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

  if jsonb_array_length(v_subs) = 0 then
    return;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'notify_secret';

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'notify_first_login_url';

  if v_secret is null or v_url is null then
    raise warning '初回ログイン通知: Vault に notify_secret / notify_first_login_url がありません';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    body := jsonb_build_object('employee_name', v_name, 'subscriptions', v_subs),
    timeout_milliseconds := 15000
  );
end;
$$;
