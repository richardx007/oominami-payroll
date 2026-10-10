-- 端末承認制(アクセスの厳格化)。メール・パスワードが漏れても、管理者が承認していない端末からは
-- データを読めないようにするための仕組み。給与管理(payroll)と経費管理(business)で共用する。
--
-- しくみ:
--   - 端末(ブラウザ)ごとにランダムな合言葉を httpOnly Cookie に持たせ、DBにはそのハッシュだけを置く
--     (trusted_devices)。アプリ(Cookie の置き場所)が違えば、同じ端末でも別の端末として扱う。
--   - ログインごとの session_id(JWTの session_id)を device_sessions に記録し、
--     「承認済みの端末からのログインか」をここで判定する(RLSは Cookie を見られないため)。
--   - 導入時点のログイン(auth.sessions)はすべて承認済みとして登録する(=今使っている端末は信用する)。
--
-- 段階: app_settings.device_enforcement
--   'log'     = 記録だけ(ブロックしない。既定)
--   'enforce' = 承認されていない端末からはデータを読めない(device_session_ok() が false)
--   ※ 'enforce' で実際に止めるには、is_admin() 等のヘルパーに device_session_ok() を組み込む
--     別マイグレーションが必要(記録期間の結果を見てから行う)。

create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null,
  app text not null check (app in ('payroll', 'business')),
  label text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  approved_how text check (approved_how in ('existing', 'admin')),
  approved_at timestamptz,
  approved_by uuid references public.employees (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (auth_user_id, token_hash)
);

comment on table public.trusted_devices is
  '端末承認制の端末(ブラウザ×アプリ×ユーザー)。token_hash は httpOnly Cookie の合言葉の SHA-256。status=pending は管理者の承認待ち。approved_how=existing は導入時点で使っていた端末。直接の参照・更新は不可で、関数経由でのみ扱う。';

create table public.device_sessions (
  session_id uuid primary key,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid references public.trusted_devices (id) on delete cascade,
  approved boolean not null,
  created_at timestamptz not null default now()
);

comment on table public.device_sessions is
  'ログイン(JWT の session_id)ごとの承認状態。device_id が null で approved=true は導入時点のログイン。直接の参照・更新は不可。';

create index device_sessions_device_idx on public.device_sessions (device_id);
create index trusted_devices_status_idx on public.trusted_devices (status);

alter table public.trusted_devices enable row level security;
alter table public.device_sessions enable row level security;
-- ポリシーは作らない(=直接は誰も読み書きできない)。下の SECURITY DEFINER 関数だけで扱う。

-- 段階の設定(記録だけ)
insert into public.app_settings (key, value) values ('device_enforcement', 'log')
on conflict (key) do nothing;

-- 導入時点のログインはすべて承認済み(今使っている端末は信用する)
insert into public.device_sessions (session_id, auth_user_id, device_id, approved)
select s.id, s.user_id, null, true
from auth.sessions s
on conflict (session_id) do nothing;

-- ------------------------------------------------------------
-- 端末の登録(ログイン後、アプリの middleware がセッションごとに1回呼ぶ)
-- 戻り値: 'approved' | 'pending' | 'revoked'
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
  v_new boolean := false;
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
    -- はじめての端末。導入時点から続いているログインなら承認済み、そうでなければ承認待ち
    insert into public.trusted_devices (auth_user_id, token_hash, app, label, status, approved_how, approved_at)
    values (
      v_uid, v_hash, p_app, left(coalesce(p_label, ''), 200),
      case when v_sess.approved then 'approved' else 'pending' end,
      case when v_sess.approved then 'existing' end,
      case when v_sess.approved then now() end
    )
    returning * into v_dev;
    v_new := v_dev.status = 'pending';
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

  if v_new then
    perform public.device_notify_pending(v_dev.id);
  end if;

  return v_dev.status;
end;
$$;

comment on function public.device_register(text, text, text) is
  '端末の登録。ログイン後にアプリの middleware がセッションごとに1回呼ぶ。新しい端末は承認待ち(pending)になり管理者へ通知する。';

revoke all on function public.device_register(text, text, text) from public, anon;
grant execute on function public.device_register(text, text, text) to authenticated;

-- ------------------------------------------------------------
-- このログインが承認済みの端末からか(RLS 用。'log' の間は常に true)
-- ------------------------------------------------------------
create or replace function public.device_session_ok()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select value from public.app_settings where key = 'device_enforcement'), 'log'
  ) <> 'enforce'
  or exists (
    select 1 from public.device_sessions
    where session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and approved
  );
$$;

revoke all on function public.device_session_ok() from public, anon;
grant execute on function public.device_session_ok() to authenticated;

-- ------------------------------------------------------------
-- 管理者向け: 端末の一覧・承認・取り消し
-- ------------------------------------------------------------
create or replace function public.device_list()
returns table (
  id uuid,
  owner_name text,
  owner_is_admin boolean,
  is_me boolean,
  app text,
  label text,
  status text,
  approved_how text,
  approved_at timestamptz,
  approver_name text,
  created_at timestamptz,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select d.id,
         coalesce(e.name, o.label, '(不明)') as owner_name,
         coalesce(e.is_admin, false) as owner_is_admin,
         d.auth_user_id = auth.uid() as is_me,
         d.app, d.label, d.status, d.approved_how, d.approved_at,
         a.name as approver_name,
         d.created_at, d.last_seen_at
  from public.trusted_devices d
  left join public.employees e on e.auth_user_id = d.auth_user_id
  left join public.ops_shared_accounts o on o.auth_user_id = d.auth_user_id
  left join public.employees a on a.id = d.approved_by
  where public.is_admin()
  order by (d.status = 'pending') desc, d.last_seen_at desc;
$$;

revoke all on function public.device_list() from public, anon;
grant execute on function public.device_list() to authenticated;

create or replace function public.device_approve(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_owner uuid;
  v_me uuid := public.current_employee_id();
begin
  if not public.is_admin() then
    raise exception '管理者だけが承認できます';
  end if;
  select auth_user_id into v_owner from public.trusted_devices where id = p_id;
  if v_owner is null then
    raise exception '端末が見つかりません';
  end if;
  -- 自分の端末は自分で承認できない(もう1人の管理者が承認する)
  if v_owner = auth.uid() then
    raise exception '自分の端末は、もう1人の管理者に承認してもらってください';
  end if;

  update public.trusted_devices
  set status = 'approved', approved_how = 'admin', approved_at = now(), approved_by = v_me,
      revoked_at = null, revoked_by = null
  where id = p_id;
  update public.device_sessions set approved = true where device_id = p_id;
end;
$$;

revoke all on function public.device_approve(uuid) from public, anon;
grant execute on function public.device_approve(uuid) to authenticated;

create or replace function public.device_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者だけが取り消せます';
  end if;
  update public.trusted_devices
  set status = 'revoked', revoked_at = now(), revoked_by = public.current_employee_id()
  where id = p_id;
  if not found then
    raise exception '端末が見つかりません';
  end if;
  update public.device_sessions set approved = false where device_id = p_id;
end;
$$;

revoke all on function public.device_revoke(uuid) from public, anon;
grant execute on function public.device_revoke(uuid) to authenticated;

-- ------------------------------------------------------------
-- 承認待ちの端末を管理者へ Push 通知する(送信は /api/notify/new-device。初回ログイン通知と同じ設計)
-- ------------------------------------------------------------
create or replace function public.device_notify_pending(p_device_id uuid)
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
      'owner_name', v_name, 'app', v_app, 'label', v_label, 'subscriptions', v_subs
    ),
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function public.device_notify_pending(uuid) from public, anon, authenticated;

-- ============================================================
-- 復元手順(DR復旧時・新環境構築時)
-- ============================================================
-- select vault.create_secret(
--   'https://<デプロイ先>/api/notify/new-device',
--   'notify_new_device_url',
--   '新しい端末(承認待ち)の通知APIのURL'
-- );
-- (notify_secret は punch通知のVault登録を共用するため、別途登録不要)
