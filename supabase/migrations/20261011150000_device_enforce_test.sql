-- 端末承認制: ブロックの試験運用と、承認の手間を減らす3つの仕組み(2026-10-11)。
--
-- 1. 試験運用: device_enforce_test に入れたアカウントだけ、全体が 'log' のままでも実際にブロックする。
--    ブロックは RLS の土台になる関数(current_employee_id / is_admin / is_owner / is_leader /
--    ops_is_staff)と、auth.uid() を直接見るポリシー(employees / ops_shared_accounts)で行う。
--    device_session_ok() は、ブロック対象でない人には常に true を返すので、他の人には何も変わらない。
-- 2. 登録直後の自動承認: アカウントを作ってから24時間以内の端末は自動で承認する(管理者を除く)。
--    招待メールのリンクを Gmail アプリ内のブラウザで開く人もいるため、「最初の1台だけ」にはしない。
--    管理者には「自動で承認した」と通知する。
-- 3. 確認コード: 承認済みの端末で6桁のコード(10分・1回限り・5回まちがえたら無効)を出し、
--    承認待ちの端末で入力すると承認される(機種変更など)。
-- 4. 引き継ぎ札: 承認済みの Safari で「ホーム画面に追加」するとき、起動先(manifest の start_url)に
--    使い捨ての札(24時間・1回限り)を付ける。ホーム画面アプリで初めてログインしたとき、札があれば承認する。
--    iPhone はホーム画面アプリと Safari が Cookie を共有しないため、これが無いと別の端末として承認待ちになる。

-- ------------------------------------------------------------
-- 承認の方法に、登録直後(invite)・確認コード(code)・引き継ぎ札(handoff)を足す
-- ------------------------------------------------------------
alter table public.trusted_devices drop constraint trusted_devices_approved_how_check;
alter table public.trusted_devices add constraint trusted_devices_approved_how_check
  check (approved_how in ('existing', 'admin', 'invite', 'code', 'handoff'));

-- ------------------------------------------------------------
-- 試験運用の対象
-- ------------------------------------------------------------
create table public.device_enforce_test (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.device_enforce_test is
  '端末承認制の試験運用。ここに入れたアカウントだけ、app_settings.device_enforcement が log でも実際にブロックする。SQL で追加・削除する。';
alter table public.device_enforce_test enable row level security;

-- このログインの人はブロックの対象か
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
  or exists (select 1 from public.device_enforce_test where auth_user_id = auth.uid());
$$;
revoke all on function public.device_enforced() from public, anon;
grant execute on function public.device_enforced() to authenticated;

create or replace function public.device_session_ok()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select not public.device_enforced()
  or exists (
    select 1 from public.device_sessions
    where session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and approved
  );
$$;

-- ------------------------------------------------------------
-- RLS の土台の関数に組み込む(承認されていない端末からは「誰でもない」扱いになる)
-- ------------------------------------------------------------
create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from employees where auth_user_id = auth.uid() and public.device_session_ok();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and is_admin = true and status = 'active'
  ) and public.device_session_ok();
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and is_admin and is_owner and status = 'active'
  ) and public.device_session_ok();
$$;

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
  ) and public.device_session_ok();
$$;

create or replace function public.ops_is_staff()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select (
    exists (
      select 1 from public.employees
      where auth_user_id = auth.uid() and status = 'active'
    ) or exists (
      select 1 from public.ops_shared_accounts
      where auth_user_id = auth.uid() and is_active
    )
  ) and public.device_session_ok();
$$;

create or replace function public.ops_can_view_expense(p_created_by uuid, p_staff_id uuid, p_advanced_by uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.device_session_ok() and case
    when public.is_admin() then true
    -- 共有アカウント: 管理者(退職者を含む)が入力した経費は見えない
    when exists (select 1 from public.ops_shared_accounts where auth_user_id = auth.uid() and is_active) then
      not exists (select 1 from public.employees where auth_user_id = p_created_by and is_admin)
    -- 従業員: 自分が入力した・自分が担当者・自分が立替者
    else
      p_created_by = auth.uid()
      or exists (
        select 1 from public.employees
        where auth_user_id = auth.uid() and status = 'active' and id in (p_staff_id, p_advanced_by)
      )
  end;
$$;

drop policy employees_select_self on public.employees;
create policy employees_select_self on public.employees
  for select
  using ((auth_user_id = auth.uid() and public.device_session_ok()) or public.is_admin());

drop policy ops_shared_accounts_select on public.ops_shared_accounts;
create policy ops_shared_accounts_select on public.ops_shared_accounts
  for select
  using (public.is_admin() or (auth_user_id = auth.uid() and public.device_session_ok()));

-- ------------------------------------------------------------
-- 管理者への通知に「自動で承認した」を足す(p_kind: 'pending' | 'auto')
-- ------------------------------------------------------------
drop function public.device_notify_pending(uuid);

create or replace function public.device_notify_pending(p_device_id uuid, p_kind text default 'pending')
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text;
  v_app text;
  v_label text;
  v_owner uuid;
  v_secret text;
  v_url text;
  v_subs jsonb;
begin
  select coalesce(nullif(trim(e.nickname), ''), e.name, o.label, '(不明)'), d.app, d.label, d.auth_user_id
  into v_name, v_app, v_label, v_owner
  from trusted_devices d
  left join employees e on e.auth_user_id = d.auth_user_id
  left join ops_shared_accounts o on o.auth_user_id = d.auth_user_id
  where d.id = p_device_id;

  -- 本人以外の在職中の管理者へ(自分の端末は自分では承認できないため)
  select coalesce(
    jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)),
    '[]'::jsonb
  )
  into v_subs
  from push_subscriptions ps
  join employees e on e.id = ps.employee_id
  where e.is_admin and e.status = 'active' and e.auth_user_id is distinct from v_owner;

  if jsonb_array_length(v_subs) = 0 then
    return;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_new_device_url';
  if v_secret is null or v_url is null then
    raise warning '新しい端末の通知: Vault に notify_secret / notify_new_device_url がありません';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object(
      'owner_name', v_name, 'app', v_app, 'label', v_label, 'subscriptions', v_subs, 'kind', p_kind
    ),
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function public.device_notify_pending(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 端末の登録: 登録直後(24時間以内)の自動承認を足す
-- ------------------------------------------------------------
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

  if v_dev.id is null then
    -- はじめての端末。
    --   導入時点から続いているログイン → 承認済み(existing)
    --   アカウントを作ってから24時間以内(管理者以外・取り消された端末が無い) → 自動で承認(invite)
    --   それ以外 → 承認待ち
    if v_sess.approved then
      v_how := 'existing';
    elsif exists (
      select 1 from auth.users u
      where u.id = v_uid and u.created_at > now() - interval '24 hours'
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

-- ------------------------------------------------------------
-- 承認待ちの画面用: このログインの状態
-- ------------------------------------------------------------
create or replace function public.device_my_status()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'approved', coalesce(s.approved, false),
    'device_status', d.status,
    'label', d.label,
    'enforced', public.device_enforced(),
    'name', coalesce(nullif(trim(e.nickname), ''), e.name, o.label, '')
  )
  from (select auth.uid() as uid, nullif(auth.jwt() ->> 'session_id', '')::uuid as sid) me
  left join public.device_sessions s on s.session_id = me.sid
  left join public.trusted_devices d on d.id = s.device_id
  left join public.employees e on e.auth_user_id = me.uid
  left join public.ops_shared_accounts o on o.auth_user_id = me.uid
  where me.uid is not null;
$$;
revoke all on function public.device_my_status() from public, anon;
grant execute on function public.device_my_status() to authenticated;

-- このログインの端末を承認する(確認コード・引き継ぎ札の共通処理)。承認待ちの端末だけ。
create or replace function public.device_approve_current(p_how text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_dev uuid;
begin
  select d.id into v_dev
  from public.device_sessions s
  join public.trusted_devices d on d.id = s.device_id
  where s.session_id = v_sid and s.auth_user_id = auth.uid() and d.status = 'pending';
  if v_dev is null then
    return null;
  end if;
  update public.trusted_devices
  set status = 'approved', approved_how = p_how, approved_at = now()
  where id = v_dev;
  update public.device_sessions set approved = true where device_id = v_dev;
  return v_dev;
end;
$$;
revoke all on function public.device_approve_current(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 確認コード
-- ------------------------------------------------------------
create table public.device_pair_codes (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  failed_attempts int not null default 0,
  used_at timestamptz,
  used_device_id uuid references public.trusted_devices (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.device_pair_codes is
  '端末承認制の確認コード(承認済みの端末で発行し、承認待ちの端末で入力)。code_hash は sha256(auth_user_id:コード)。10分・1回限り・5回まちがえたら無効。直接の参照・更新は不可。';
create index device_pair_codes_user_idx on public.device_pair_codes (auth_user_id, created_at desc);
alter table public.device_pair_codes enable row level security;

-- 承認済みの端末で、6桁のコードを出す
create or replace function public.device_pair_code_create()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_code text;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  if v_uid is null or v_sid is null then
    raise exception 'ログインしていません';
  end if;
  if not exists (select 1 from public.device_sessions where session_id = v_sid and approved) then
    raise exception 'この端末はまだ承認されていないため、コードを出せません';
  end if;
  if (select count(*) from public.device_pair_codes
      where auth_user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'コードを出せる回数(1時間に10回)を超えました。しばらくしてからやり直してください';
  end if;

  -- 前に出したコードは使えなくする(いつも最新の1つだけ)
  update public.device_pair_codes set expires_at = now()
  where auth_user_id = v_uid and used_at is null and expires_at > now();

  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.device_pair_codes (auth_user_id, code_hash, expires_at)
  values (v_uid, encode(extensions.digest(v_uid::text || ':' || v_code, 'sha256'), 'hex'), v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;
revoke all on function public.device_pair_code_create() from public, anon;
grant execute on function public.device_pair_code_create() to authenticated;

-- 承認待ちの端末で、コードを入力する。
-- 戻り値 result: 'approved' | 'wrong'(remaining に残り回数) | 'locked' | 'expired' | 'not_pending'
create or replace function public.device_pair_code_redeem(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.device_pair_codes%rowtype;
  v_dev uuid;
begin
  if v_uid is null then
    raise exception 'ログインしていません';
  end if;
  if not exists (
    select 1 from public.device_sessions s
    join public.trusted_devices d on d.id = s.device_id
    where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid and d.status = 'pending'
  ) then
    return jsonb_build_object('result', 'not_pending');
  end if;

  select * into v_row from public.device_pair_codes
  where auth_user_id = v_uid and used_at is null and expires_at > now()
  order by created_at desc limit 1
  for update;

  if v_row.id is null then
    return jsonb_build_object('result', 'expired');
  end if;
  if v_row.failed_attempts >= 5 then
    return jsonb_build_object('result', 'locked');
  end if;

  if coalesce(p_code, '') !~ '^[0-9]{6}$'
     or encode(extensions.digest(v_uid::text || ':' || p_code, 'sha256'), 'hex') <> v_row.code_hash then
    update public.device_pair_codes set failed_attempts = failed_attempts + 1 where id = v_row.id;
    if v_row.failed_attempts + 1 >= 5 then
      return jsonb_build_object('result', 'locked');
    end if;
    return jsonb_build_object('result', 'wrong', 'remaining', 5 - (v_row.failed_attempts + 1));
  end if;

  v_dev := public.device_approve_current('code');
  update public.device_pair_codes set used_at = now(), used_device_id = v_dev where id = v_row.id;
  return jsonb_build_object('result', 'approved');
end;
$$;
revoke all on function public.device_pair_code_redeem(text) from public, anon;
grant execute on function public.device_pair_code_redeem(text) to authenticated;

-- ------------------------------------------------------------
-- 引き継ぎ札(ホーム画面に追加)
-- ------------------------------------------------------------
create table public.device_handoffs (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_device_id uuid references public.trusted_devices (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.device_handoffs is
  '端末承認制の引き継ぎ札。承認済みの端末で「ホーム画面に追加」の案内を開いたときに発行し、manifest の start_url に付ける。24時間・1回限り。token_hash は札の SHA-256。直接の参照・更新は不可。';
create index device_handoffs_user_idx on public.device_handoffs (auth_user_id, created_at desc);
alter table public.device_handoffs enable row level security;

-- 承認済みの端末で札を発行する(承認されていなければ null)
create or replace function public.device_handoff_create()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_token text;
begin
  if v_uid is null or v_sid is null then
    return null;
  end if;
  if not exists (select 1 from public.device_sessions where session_id = v_sid and approved) then
    return null;
  end if;
  -- 古い札を片付ける(期限切れ・使用済みは削除し、残りは新しい順に4枚まで。新しい札と合わせて5枚)
  delete from public.device_handoffs
  where auth_user_id = v_uid and (expires_at < now() or used_at is not null);
  delete from public.device_handoffs
  where id in (select id from public.device_handoffs where auth_user_id = v_uid
               order by created_at desc offset 4);
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.device_handoffs (auth_user_id, token_hash, expires_at)
  values (v_uid, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '24 hours');
  return v_token;
end;
$$;
revoke all on function public.device_handoff_create() from public, anon;
grant execute on function public.device_handoff_create() to authenticated;

-- 承認待ちの端末で札を使う。戻り値: 'approved' | 'invalid'
create or replace function public.device_handoff_redeem(p_token text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_dev uuid;
begin
  if v_uid is null or coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then
    return 'invalid';
  end if;
  select id into v_id from public.device_handoffs
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and auth_user_id = v_uid and used_at is null and expires_at > now()
  for update;
  if v_id is null then
    return 'invalid';
  end if;
  v_dev := public.device_approve_current('handoff');
  if v_dev is null then
    return 'invalid';
  end if;
  update public.device_handoffs set used_at = now(), used_device_id = v_dev where id = v_id;
  return 'approved';
end;
$$;
revoke all on function public.device_handoff_redeem(text) from public, anon;
grant execute on function public.device_handoff_redeem(text) to authenticated;

-- 管理者の端末画面に、試験運用の対象を出す
create or replace function public.device_enforce_test_list()
returns table (name text)
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(e.name, o.label, '(不明)')
  from public.device_enforce_test t
  left join public.employees e on e.auth_user_id = t.auth_user_id
  left join public.ops_shared_accounts o on o.auth_user_id = t.auth_user_id
  where public.is_admin()
  order by 1;
$$;
revoke all on function public.device_enforce_test_list() from public, anon;
grant execute on function public.device_enforce_test_list() to authenticated;
