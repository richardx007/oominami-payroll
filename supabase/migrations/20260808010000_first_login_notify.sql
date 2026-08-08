-- 新しい従業員の初回パスワード設定完了を管理者へ通知する。
--
-- ⚠️ このファイルは「何を設定したか」の記録。**復元時はVaultへのURL再登録が必要**
--    (シークレット自体は notify_secret を punch通知と共用するため新規登録は不要)。

create or replace function public.notify_first_login()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_name text;
  v_secret text;
  v_url text;
  v_subs jsonb;
begin
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

comment on function public.notify_first_login() is
  '本人の初回パスワード設定完了時に呼ぶ。管理者の購読先へPush通知を送る(送信自体はAPI経由)。';

revoke all on function public.notify_first_login() from public;
grant execute on function public.notify_first_login() to authenticated;

-- ============================================================
-- 復元手順(DR復旧時・新環境構築時)
-- ============================================================
-- select vault.create_secret(
--   'https://<デプロイ先>/api/notify/first-login',
--   'notify_first_login_url',
--   '初回ログイン通知APIのURL'
-- );
-- (notify_secret は punch通知のVault登録を共用するため、別途登録不要)
