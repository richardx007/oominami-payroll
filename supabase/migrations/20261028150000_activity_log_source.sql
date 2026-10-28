-- ============================================================
-- 操作ログに「実行環境」を足す(2026-10-28 オーナー依頼)
--
-- activity_logs.source: 'アプリ'(ホーム画面アプリ)/ 'ブラウザ' / 'GitHub' / 'Supabase' / 'Cloudflare' / 'Claude'。
-- 分からないものは null(画面ではブランク)。
-- - 画面からの操作: サーバー側の Supabase クライアントが、ホーム画面アプリの目印 Cookie(oom_pwa)を見て
--   ヘッダー x-oom-source(app / browser)を付ける(src/lib/supabase/server.ts)。log_activity はそれを読む。
--   ブラウザから直接 log_activity を呼ぶ画面(ログイン・パスワード設定)は p_source で渡す。
-- - 自動処理: pg_cron の関数(実行者「システム(自動)」)は Supabase、自動バックアップは GitHub。
--   画面側でも実行者の名前から補う(src/app/admin/logs/LogsView.tsx)。
-- - Claude が DB で直接行った操作は source = 'Claude' で記録する。
-- ============================================================

alter table public.activity_logs add column source text;
comment on column public.activity_logs.source is
  '実行環境(アプリ / ブラウザ / GitHub / Supabase / Cloudflare / Claude)。不明は null';

-- 引数を足すので作り直す(古い2引数版を残すと、2引数の呼び出しがどちらか決まらずエラーになる)。
-- 他の関数の中からの log_activity(action, detail) の呼び出しは、そのまま3引数版に当たる
drop function public.log_activity(text, text);

create function public.log_activity(p_action text, p_detail text default null::text, p_source text default null::text)
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
  v_source text;
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

  -- 実行環境: 引数 > サーバーが付けたヘッダー(x-oom-source)
  v_source := case
    when p_source in ('アプリ', 'ブラウザ') then p_source
    else case coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-oom-source'
      when 'app' then 'アプリ'
      when 'browser' then 'ブラウザ'
    end
  end;

  -- 未ログインでのメール送信(初回登録の確認・パスワード再設定の本人申請)はシステムの自動送信として記録する
  insert into public.activity_logs (actor_id, actor_name, action, detail, source)
  values (v_id,
          coalesce(v_name, case when p_action = 'メール送信' then 'システム' else '(未ログイン)' end),
          p_action, left(p_detail, 1000), v_source);

  -- 保持期間(90日)より古いログを削除。削除が発生したらその件数を記録する。
  if random() < 0.05 then
    delete from public.activity_logs
    where created_at < now() - interval '90 days';
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then
      insert into public.activity_logs (actor_id, actor_name, action, detail, source)
      values (
        null,
        'システム(自動)',
        'ログ削除',
        format('保持期間(90日)超過のログを%s件削除しました', v_deleted),
        'Supabase'
      );
    end if;
  end if;
end;
$function$;
revoke all on function public.log_activity(text, text, text) from public;
grant execute on function public.log_activity(text, text, text) to anon, authenticated, service_role;

-- ---- 過去のログ: 内容から分かるものだけ埋める(分からないものは null のまま) ----
update public.activity_logs set source = 'Claude'
where source is null and (detail like '%DBで直接%' or detail like '%DBから直接%');
-- ログイン: 「メール / PWA / iPhone / ...」「メール / ブラウザ / ...」
update public.activity_logs set source = 'アプリ' where source is null and detail like '% / PWA / %';
update public.activity_logs set source = 'ブラウザ' where source is null and detail like '% / ブラウザ / %';
-- 打刻: 「(アプリのメニュー・PWA)」「(標準カメラから・ブラウザ)」など
update public.activity_logs set source = 'アプリ' where source is null and detail like '%・PWA)%';
update public.activity_logs set source = 'ブラウザ' where source is null and detail like '%・ブラウザ)%';
update public.activity_logs set source = 'Supabase' where source is null and actor_name = 'システム(自動)';
update public.activity_logs set source = 'GitHub' where source is null and actor_name = '自動バックアップ';
