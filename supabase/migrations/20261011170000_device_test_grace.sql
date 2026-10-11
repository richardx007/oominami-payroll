-- 端末承認制の試験運用: 「登録直後の自動承認」の時間を、試験対象のアカウントだけ短くできるようにする。
-- 新入社員の流れ(招待 → Safari で登録 → ホーム画面に追加)で、引き継ぎ札が無いとブロックされ、
-- 札があれば自動で承認されることを確かめるため(24時間のままだとホーム画面アプリも自動承認されて区別できない)。
-- grace_minutes が null なら通常どおり 24時間。
alter table public.device_enforce_test add column grace_minutes int check (grace_minutes >= 0);
comment on column public.device_enforce_test.grace_minutes is
  '登録直後の自動承認の時間(分)。null は通常の24時間。試験のために短くする。';

create or replace function public.device_register(p_token text, p_app text, p_label text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_hash text;
  v_dev public.trusted_devices%rowtype;
  v_sess public.device_sessions%rowtype;
  v_how text;
  v_grace interval;
begin
  if v_uid is null or v_sid is null then
    raise exception 'ログインしていません';
  end if;
  if p_app not in ('payroll', 'business') then
    raise exception 'app が不正です';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception '端末の合言葉が不正です';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_dev from public.trusted_devices
  where auth_user_id = v_uid and token_hash = v_hash;

  select * into v_sess from public.device_sessions where session_id = v_sid;

  -- 登録直後の自動承認の時間(試験対象は短くできる)
  v_grace := make_interval(mins => coalesce(
    (select grace_minutes from public.device_enforce_test where auth_user_id = v_uid), 24 * 60));

  if v_dev.id is null then
    -- はじめての端末。
    --   導入時点から続いているログイン → 承認済み(existing)
    --   アカウントを作ってから24時間以内(管理者以外・取り消された端末が無い) → 自動で承認(invite)
    --   それ以外 → 承認待ち
    if v_sess.approved then
      v_how := 'existing';
    elsif exists (
      select 1 from auth.users u
      where u.id = v_uid and u.created_at > now() - v_grace
    )
    and not exists (
      select 1 from public.employees e where e.auth_user_id = v_uid and e.is_admin
    )
    and not exists (
      select 1 from public.trusted_devices d where d.auth_user_id = v_uid and d.status = 'revoked'
    ) then
      v_how := 'invite';
    end if;

    insert into public.trusted_devices (auth_user_id, token_hash, app, label, status, approved_how, approved_at)
    values (
      v_uid, v_hash, p_app, left(coalesce(p_label, ''), 200),
      case when v_how is not null then 'approved' else 'pending' end,
      v_how,
      case when v_how is not null then now() end
    )
    returning * into v_dev;

    if v_how is null then
      perform public.device_notify_pending(v_dev.id, 'pending');
    elsif v_how = 'invite' then
      perform public.device_notify_pending(v_dev.id, 'auto');
    end if;
  else
    update public.trusted_devices
    set last_seen_at = now(),
        label = case when coalesce(p_label, '') <> '' then left(p_label, 200) else label end
    where id = v_dev.id;
  end if;

  insert into public.device_sessions (session_id, auth_user_id, device_id, approved)
  values (v_sid, v_uid, v_dev.id, v_dev.status = 'approved')
  on conflict (session_id) do update
    set device_id = excluded.device_id,
        -- 導入時点のログイン(承認済み)は、その端末が取り消されない限り承認のまま
        approved = case
          when v_dev.status = 'revoked' then false
          else public.device_sessions.approved or excluded.approved
        end;

  return v_dev.status;
end;
$$;
