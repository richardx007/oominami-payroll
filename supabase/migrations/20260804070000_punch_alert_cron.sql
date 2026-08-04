-- 未打刻通知の定期実行(pg_cron)。
--
-- ⚠️ このファイルは「何を設定したか」の記録。**復元時はシークレットの再登録が必要**。
--    Vault の中身(notify_secret / notify_url)はダンプに含まれないため、
--    DR復旧後は下記の「復元手順」を実行すること。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- pg_cron から5分ごとに呼ばれるジョブ本体。
--
-- 「送るものが有るときだけ POST する」ようにしている。毎回 POST すると Cloudflare
-- Worker を無駄に起こすことになり、無料プランの実行回数・CPU を消費するため
-- (全員一斉配信で Error 1102 を起こした前例がある)。
--
-- 🔴 シークレットは Vault から取り出す。関数本体(pg_proc.prosrc)は一般ユーザーからも
--    読めてしまうため、**ここに平文で書かないこと**。
create or replace function public.run_punch_alert_job()
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
  v_payload := public.collect_punch_alerts();

  -- 未打刻が無い(=大半のケース)なら何もしない
  if jsonb_array_length(v_payload->'alerts') = 0 then
    return;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'notify_secret';

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'notify_url';

  if v_secret is null or v_url is null then
    raise warning '未打刻通知: Vault に notify_secret / notify_url がありません';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    body := v_payload,
    timeout_milliseconds := 15000
  );
end;
$$;

comment on function public.run_punch_alert_job() is
  'pg_cron から5分ごとに呼ぶ未打刻通知ジョブ。通知がある時だけ API へ POST する。';

revoke all on function public.run_punch_alert_job() from public;

-- ============================================================
-- 復元手順(DR復旧時・新環境構築時)
-- ============================================================
-- 1) Vault にシークレットを登録する(値は Cloudflare の環境変数と一致させること):
--
--    select vault.create_secret('<NOTIFY_SECRET と同じ値>', 'notify_secret', '未打刻通知APIの共有シークレット');
--    select vault.create_secret('https://<デプロイ先>/api/notify/punch', 'notify_url', '未打刻通知APIのURL');
--
-- 2) cron ジョブを登録する:
--
--    select cron.schedule('punch-alerts', '*/5 * * * *', $job$select public.run_punch_alert_job();$job$);
--
-- 確認:  select jobid, jobname, schedule, active from cron.job;
-- 解除:  select cron.unschedule('punch-alerts');
