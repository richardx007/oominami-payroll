-- 操作ログの氏名列(actor_name)を、ニックネーム優先(未設定なら氏名)で記録する。
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

  insert into public.activity_logs (actor_id, actor_name, action, detail)
  values (v_id, coalesce(v_name, '(未ログイン)'), p_action, left(p_detail, 1000));

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
