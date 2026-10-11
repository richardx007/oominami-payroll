-- 端末承認制の試験運用: 試験対象を「従業員」でも指定できるようにする。
-- 新入社員の流れを試すとき、アカウント(auth.users)は登録の途中で初めてできるため、
-- 招待する前に auth_user_id では指定できない。従業員を先に作り、その employee_id で指定しておく。
alter table public.device_enforce_test drop constraint device_enforce_test_pkey;
alter table public.device_enforce_test alter column auth_user_id drop not null;
alter table public.device_enforce_test add column id uuid not null default gen_random_uuid() primary key;
alter table public.device_enforce_test add column employee_id uuid unique references public.employees (id) on delete cascade;
alter table public.device_enforce_test add constraint device_enforce_test_auth_user_id_key unique (auth_user_id);
alter table public.device_enforce_test add constraint device_enforce_test_target_check
  check (auth_user_id is not null or employee_id is not null);
comment on table public.device_enforce_test is
  '端末承認制の試験運用。ここに入れたアカウント(auth_user_id か employee_id で指定)だけ、app_settings.device_enforcement が log でも実際にブロックする。SQL で追加・削除する。';

-- このログインの人の試験の行(無ければ null)
create or replace function public.device_test_grace_minutes()
returns int
language sql
stable
security definer
set search_path to ''
as $$
  select t.grace_minutes from public.device_enforce_test t
  where t.auth_user_id = auth.uid()
     or t.employee_id = (select e.id from public.employees e where e.auth_user_id = auth.uid())
  limit 1;
$$;
revoke all on function public.device_test_grace_minutes() from public, anon, authenticated;

create or replace function public.device_enforced()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select value from public.app_settings where key = 'device_enforcement'), 'log'
  ) = 'enforce'
  or exists (
    select 1 from public.device_enforce_test t
    where t.auth_user_id = auth.uid()
       or t.employee_id = (select e.id from public.employees e where e.auth_user_id = auth.uid())
  );
$$;

create or replace function public.device_enforce_test_list()
returns table (name text)
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(e.name, e2.name, o.label, '(不明)')
  from public.device_enforce_test t
  left join public.employees e on e.auth_user_id = t.auth_user_id
  left join public.employees e2 on e2.id = t.employee_id
  left join public.ops_shared_accounts o on o.auth_user_id = t.auth_user_id
  where public.is_admin()
  order by 1;
$$;

-- 自動承認の時間を、従業員で指定した試験対象にも効かせる
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
    public.device_test_grace_minutes(), 24 * 60));

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
