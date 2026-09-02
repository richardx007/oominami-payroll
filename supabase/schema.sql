-- =============================================================================
-- 現在のDBスキーマのスナップショット（2026-07-28 時点）
--
-- ⚠️ このファイルは手で書かない。毎日のバックアップ（.github/workflows/backup.yml）が
--    プライベートリポジトリ `oominami-payroll-backups` に出力する schema.sql の写し。
--    更新するときはバックアップ側の最新版をコピーしてくること。
--
-- なぜ置いているか:
--   `supabase/migrations/` は完全な履歴ではない。初期にダッシュボードから直接適用した分が
--   記録に残っておらず、`initial_schema`（全テーブルのDDL）を含む複数がリポジトリに無い。
--   そのためマイグレーションを順に流しても現在のスキーマは再現できない。
--   再構築のときは**このファイル（またはバックアップの schema.sql）を使うこと。**
--
-- 内容: public スキーマのテーブル16・RLSポリシー37・関数20（pg_dump --schema-only --no-owner）
-- 復元手順は docs/disaster-recovery.md を参照。
-- =============================================================================

--
-- PostgreSQL database dump
--

\restrict t4mtFMaa49lZ77T9Fq4La1XdZEZ5MOyYACBmhjO6T47as4PGVUoyVPLh05YI073

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: count_employee_work_entries(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_employee_work_entries(p_employee_id uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  select count(*)::int into n from work_entries where employee_id = p_employee_id;
  return n;
end $$;


--
-- Name: current_employee_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_employee_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from employees where auth_user_id = auth.uid();
$$;


--
-- Name: delete_employee(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_employee(p_employee_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  delete from notifications
  where sender_id = p_employee_id or recipient_id = p_employee_id;

  delete from employees where id = p_employee_id;
end $$;


--
-- Name: email_registered(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.email_registered(p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from employees
    where email = lower(p_email) and status = 'active' and auth_user_id is null
  );
$$;


--
-- Name: get_break_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_break_settings() RETURNS TABLE(key text, value text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select key, value from app_settings where key like 'break\_window\_%' escape '\';
$$;


--
-- Name: get_clock_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_clock_settings() RETURNS TABLE(key text, value text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select key, value from public.app_settings where key like 'clock\_%' escape '\';
$$;


--
-- Name: get_contact_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_contact_settings() RETURNS TABLE(key text, value text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select key, value from app_settings where key in ('company_name', 'gmail_user');
$$;


--
-- Name: get_employee_names(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_employee_names(p_ids uuid[]) RETURNS TABLE(id uuid, display_name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id, coalesce(nullif(trim(nickname), ''), name)
  from employees
  where id = any(p_ids);
$$;


--
-- Name: get_shift_roster(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shift_roster() RETURNS TABLE(id uuid, name text, nickname text, color text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id, name, nickname, color
  from employees
  where status = 'active' and is_admin = false
  order by employee_no;
$$;


--
-- Name: get_shift_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shift_settings() RETURNS TABLE(key text, value text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select key, value from app_settings
  where key like 'shift_slot_%' or key = 'shift_month_start';
$$;


--
-- Name: get_shift_status(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shift_status(p_start date, p_end date) RETURNS TABLE(employee_id uuid, work_date date, status text, planned_start text, planned_end text, actual_start text, actual_end text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a_s text; a_e text; b_s text; b_e text; c_s text; c_e text;
begin
  select value into a_s from app_settings where key = 'shift_slot_a_start';
  select value into a_e from app_settings where key = 'shift_slot_a_end';
  select value into b_s from app_settings where key = 'shift_slot_b_start';
  select value into b_e from app_settings where key = 'shift_slot_b_end';
  select value into c_s from app_settings where key = 'shift_slot_c_start';
  select value into c_e from app_settings where key = 'shift_slot_c_end';

  return query
  with slots(k, s, e) as (
    values ('A', norm_hhmm(a_s), norm_hhmm(a_e)),
           ('B', norm_hhmm(b_s), norm_hhmm(b_e)),
           ('C', norm_hhmm(c_s), norm_hhmm(c_e))
  ),
  plan as (
    select sa.employee_id eid, sa.work_date wd,
      coalesce(norm_hhmm(sa.custom_start), sl.s) ps,
      coalesce(norm_hhmm(sa.custom_end), sl.e) pe
    from shift_assignments sa
    join slots sl on sl.k = sa.slot
    where sa.work_date between p_start and p_end
  ),
  act as (
    select we.employee_id eid, we.work_date wd,
      to_char(we.start_time, 'HH24:MI') as_s,
      case when we.end_time is null then null else to_char(we.end_time, 'HH24:MI') end as_e
    from work_entries we
    where we.work_date between p_start and p_end
  )
  select
    coalesce(p.eid, a.eid),
    coalesce(p.wd, a.wd),
    case
      when p.eid is null then 'unplanned'
      when a.eid is null then 'missing'
      when p.ps = a.as_s and coalesce(p.pe, '') = coalesce(a.as_e, '') then 'match'
      else 'timediff'
    end,
    p.ps,
    p.pe,
    a.as_s,
    a.as_e
  from plan p
  full outer join act a on p.eid = a.eid and p.wd = a.wd;
end;
$$;


--
-- Name: get_timesheet_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_timesheet_lock() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select value from app_settings where key = 'lock_employee_time_edit'), 'false') = 'true';
$$;


--
-- Name: get_work_rules_meta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_work_rules_meta() RETURNS TABLE(key text, value text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select key, value from app_settings where key like 'work\_rules\_%' escape '\';
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and is_admin = true and status = 'active'
  );
$$;


--
-- Name: is_period_open(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_period_open(d date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1 from pay_periods
    where d between start_date and end_date and status <> 'open'
  );
$$;


--
-- Name: is_shift_locked(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_shift_locked(p_employee_id uuid, d date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from shift_locks l
    where l.employee_id = p_employee_id and l.work_date = d
  );
$$;


--
-- Name: parse_slot_time(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.parse_slot_time(t text) RETURNS interval
    LANGUAGE sql IMMUTABLE
    AS $_$
  select case
    when t is null or trim(t) !~ '^\d{1,2}:\d{1,2}$' then null
    else make_interval(
      hours => (split_part(trim(t), ':', 1))::int % 24,
      mins  => (split_part(trim(t), ':', 2))::int
    )
  end;
$_$;


--
-- Name: collect_punch_alerts(); Type: FUNCTION; Schema: public; Owner: -
--
-- 未打刻を検出し、通知済みとして記録したうえで Web Push 送信用のペイロードを返す。
-- pg_cron から呼ぶ。※復元後は pg_cron のジョブ登録も別途必要(docs/handover.md 参照)。

CREATE FUNCTION public.collect_punch_alerts() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_now timestamp;
  v_enabled_in boolean;
  v_enabled_out boolean;
  v_delay_in interval := interval '5 minutes';
  v_delay_out interval := interval '30 minutes';
  v_window interval := interval '12 hours';
  v_alerts jsonb;
  v_subs jsonb;
begin
  -- 出勤/退勤で別々のスイッチ(2026-08-06分離)。既定はオン(未設定時にfalseへ倒さない)。
  select coalesce(
    (select value <> 'false' from app_settings where key = 'notify_missing_punch_in'),
    true
  ) into v_enabled_in;
  select coalesce(
    (select value <> 'false' from app_settings where key = 'notify_missing_punch_out'),
    true
  ) into v_enabled_out;

  if not v_enabled_in and not v_enabled_out then
    return jsonb_build_object('alerts', '[]'::jsonb, 'subscriptions', '[]'::jsonb);
  end if;

  v_now := (now() at time zone 'Asia/Tokyo');

  with slot_def as (
    select 'A'::text as slot,
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_a_start')), interval '8 hours') as s,
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_a_end')), interval '17 hours') as e
    union all
    select 'B',
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_b_start')), interval '15 hours'),
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_b_end')), interval '0 hours')
    union all
    select 'C',
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_c_start')), interval '0 hours'),
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_c_end')), interval '9 hours')
  ),
  raw as (
    select
      sa.employee_id,
      sa.work_date,
      coalesce(parse_slot_time(nullif(trim(sa.custom_start), '')), sd.s) as s,
      coalesce(parse_slot_time(nullif(trim(sa.custom_end), '')), sd.e) as e
    from shift_assignments sa
    join slot_def sd on sd.slot = sa.slot
    where sa.work_date between (v_now::date - 2) and (v_now::date + 1)
  ),
  sched as (
    select
      r.employee_id,
      r.work_date,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end) as start_at,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end)
        + (case when r.e > r.s then r.e - r.s else r.e - r.s + interval '24 hours' end) as end_at
    from raw r
  ),
  found as (
    select s.employee_id, s.work_date, 'in'::text as kind, s.start_at as due_at
    from sched s
    left join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where v_enabled_in
      and w.id is null
      and v_now >= s.start_at + v_delay_in
      and s.start_at >= v_now - v_window
    union all
    select s.employee_id, s.work_date, 'out', s.end_at
    from sched s
    join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where v_enabled_out
      and w.end_time is null
      and v_now >= s.end_at + v_delay_out
      and s.end_at >= v_now - v_window
  ),
  inserted as (
    insert into punch_alerts (employee_id, work_date, kind)
    select employee_id, work_date, kind from found
    on conflict (employee_id, work_date, kind) do nothing
    returning employee_id, work_date, kind
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', coalesce(nullif(trim(e.nickname), ''), e.name),
        'work_date', to_char(i.work_date, 'YYYY-MM-DD'),
        'kind', i.kind,
        'due_at', to_char(f.due_at, 'HH24:MI')
      )
    ),
    '[]'::jsonb
  )
  into v_alerts
  from inserted i
  join employees e on e.id = i.employee_id
  join found f
    on f.employee_id = i.employee_id and f.work_date = i.work_date and f.kind = i.kind;

  if v_alerts = '[]'::jsonb then
    return jsonb_build_object('alerts', '[]'::jsonb, 'subscriptions', '[]'::jsonb);
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

  return jsonb_build_object('alerts', v_alerts, 'subscriptions', v_subs);
end;
$$;


--
-- Name: is_shift_draft(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_shift_draft(d date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select m.status = 'draft' from shift_modes m
      where m.period_key = shift_period_key(d)),
    shift_period_key(d) > shift_period_key(((now() at time zone 'Asia/Tokyo')::date))
  );
$$;


--
-- Name: update_own_profile(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_own_profile(p_nickname text, p_name text, p_furigana text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
begin
  v_id := current_employee_id();
  if v_id is null then
    raise exception '従業員が見つかりません';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception '氏名を入力してください';
  end if;
  if length(trim(p_name)) > 100 or length(coalesce(p_nickname, '')) > 50
     or length(coalesce(p_furigana, '')) > 50 then
    raise exception '入力が長すぎます';
  end if;

  update employees
  set nickname = nullif(trim(p_nickname), ''),
      name = trim(p_name),
      furigana = nullif(trim(p_furigana), '')
  where id = v_id;
end;
$$;

COMMENT ON FUNCTION public.update_own_profile(p_nickname text, p_name text, p_furigana text) IS
  '本人がニックネーム・氏名・ふりがなを変更する。自分の行のこの3列のみ更新可能。';


--
-- Name: notify_first_login(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_first_login() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

COMMENT ON FUNCTION public.notify_first_login() IS
  '本人の初回パスワード設定完了時に呼ぶ。管理者の購読先へPush通知を送る(送信自体はAPI経由)。';


--
-- Name: link_employee_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_employee_account() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update employees
  set auth_user_id = auth.uid()
  where email = (auth.jwt()->>'email') and auth_user_id is null;
  return found;
end $$;


--
-- Name: log_activity(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_activity(p_action text, p_detail text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: norm_hhmm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.norm_hhmm(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case
    when t is null or t = '' then null
    else lpad((((split_part(t, ':', 1))::int % 24))::text, 2, '0')
         || ':' || lpad(coalesce(nullif(split_part(t, ':', 2), ''), '0'), 2, '0')
  end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- Name: set_work_entry_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_work_entry_audit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, new.updated_by);
  elsif tg_op = 'UPDATE' then
    new.created_by = old.created_by;
  end if;
  return new;
end $$;


--
-- Name: shift_period_key(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shift_period_key(d date) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when coalesce(
      (select value from app_settings where key = 'shift_month_start'), '0'
    ) in ('1', 'true')
      then to_char(d, 'YYYY-MM')
    else to_char(
      case when extract(day from d) > 25 then (d + interval '1 month') else d end,
      'YYYY-MM'
    )
  end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_name text,
    action text NOT NULL,
    detail text
);


--
-- Name: advance_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    amount integer NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT advance_payments_amount_check CHECK ((amount >= 0))
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clock_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clock_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    employee_id uuid NOT NULL,
    type text NOT NULL,
    event_at timestamp with time zone NOT NULL,
    work_entry_id uuid,
    latitude double precision,
    longitude double precision,
    accuracy double precision,
    distance_m double precision,
    out_of_range boolean,
    location_denied boolean DEFAULT false NOT NULL,
    user_agent text,
    CONSTRAINT clock_events_type_check CHECK ((type = ANY (ARRAY['in'::text, 'out'::text])))
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_no text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    auth_user_id uuid,
    is_admin boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invited_at timestamp with time zone,
    furigana text,
    nickname text,
    color text,
    CONSTRAINT employees_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);


--
-- Name: COLUMN employees.invited_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.invited_at IS '最後に初回登録の招待メールを送信した日時(再招待で更新)';


--
-- Name: COLUMN employees.furigana; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.furigana IS 'ふりがな(カタカナ推奨、任意)';


--
-- Name: COLUMN employees.nickname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.nickname IS 'ニックネーム(任意)';


--
-- Name: COLUMN employees.color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.color IS 'シフト表でニックネーム背景に使う識別色(HEX。パレット10色から選択・任意・重複可)';


--
-- Name: lunch_allowance_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lunch_allowance_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    lunch_allowance integer NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lunch_allowance_rates_lunch_allowance_check CHECK ((lunch_allowance >= 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    recipient_id uuid,
    type text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    emailed boolean DEFAULT false NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['individual'::text, 'broadcast'::text, 'reminder'::text])))
);


--
-- Name: pay_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_label text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    payment_date date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pay_periods_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'paid'::text])))
);


--
-- Name: payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    pay_period_id uuid NOT NULL,
    work_days integer NOT NULL,
    total_minutes integer NOT NULL,
    hourly_wage integer NOT NULL,
    base_pay integer NOT NULL,
    transport_total integer NOT NULL,
    lunch_total integer NOT NULL,
    gross_pay integer NOT NULL,
    income_tax integer NOT NULL,
    net_pay integer NOT NULL,
    tax_category text NOT NULL,
    finalized_at timestamp with time zone,
    emailed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    night_minutes integer DEFAULT 0 NOT NULL,
    night_pay integer DEFAULT 0 NOT NULL,
    overtime_minutes integer DEFAULT 0 NOT NULL,
    overtime_pay integer DEFAULT 0 NOT NULL,
    advance_deduction integer DEFAULT 0 NOT NULL
);


--
-- Name: COLUMN payslips.overtime_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payslips.overtime_minutes IS '1日8時間を超えた残業分数の合計';


--
-- Name: COLUMN payslips.overtime_pay; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payslips.overtime_pay IS '残業手当(単価の25%割増分)の合計';


--
-- Name: shift_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    slot text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_start text,
    custom_end text,
    CONSTRAINT shift_assignments_slot_check CHECK ((slot = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
);


--
-- Name: COLUMN shift_assignments.custom_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shift_assignments.custom_start IS '変則出勤予定(HH:MMまたは"24:00"等)。入力時は枠の既定開始時刻を上書き。空なら枠の既定を使用';


--
-- Name: COLUMN shift_assignments.custom_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shift_assignments.custom_end IS '変則退勤予定(HH:MMまたは"24:00"等)。入力時は枠の既定終了時刻を上書き。空なら枠の既定を使用';


--
-- Name: shift_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_locks (
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE shift_locks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shift_locks IS '従業員本人がかけた「変更不可」ロック。ロック日は管理者でもシフトを追加/変更/削除できない(確定モード後も有効)。外せるのは本人のみ';


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE push_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.push_subscriptions IS 'Web Push の購読情報(端末ごと)。通知を許可した端末だけがここに登録される。';


--
-- Name: punch_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punch_alerts (
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    kind text NOT NULL,
    notified_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT punch_alerts_kind_check CHECK ((kind = ANY (ARRAY['in'::text, 'out'::text])))
);


--
-- Name: TABLE punch_alerts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.punch_alerts IS '未打刻通知の送信済み記録。(従業員, 業務日, 種別)で重複送信を防ぐ。';


--
-- Name: shift_modes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_modes (
    period_key text NOT NULL,
    status text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shift_modes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text])))
);


--
-- Name: tax_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pay_period_id uuid NOT NULL,
    emailed_to text,
    emailed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    tax_category text DEFAULT 'otsu'::text NOT NULL,
    dependents integer DEFAULT 0 NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_settings_dependents_check CHECK ((dependents >= 0)),
    CONSTRAINT tax_settings_tax_category_check CHECK ((tax_category = ANY (ARRAY['kou'::text, 'otsu'::text])))
);


--
-- Name: wage_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wage_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    hourly_wage integer NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wage_rates_hourly_wage_check CHECK ((hourly_wage >= 0))
);


--
-- Name: withholding_tax_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withholding_tax_table (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    min_amount integer NOT NULL,
    max_amount integer,
    tax_kou_0 integer,
    tax_kou_1 integer,
    tax_kou_2 integer,
    tax_kou_3 integer,
    tax_otsu integer NOT NULL,
    tax_kou_4 integer,
    tax_kou_5 integer,
    tax_kou_6 integer,
    tax_kou_7 integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE withholding_tax_table; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.withholding_tax_table IS '源泉徴収税額表(月額表)。国税庁公開の甲欄(扶養0〜7人)・乙欄を保持する。';


--
-- Name: COLUMN withholding_tax_table.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.withholding_tax_table.created_at IS '取り込み日時(取込のたびに当該年度を入れ替えて再作成される)';


--
-- Name: work_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone,
    break_minutes integer DEFAULT 0 NOT NULL,
    transport_cost integer DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    transport_mode text,
    station_from text,
    station_to text,
    round_trip boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    lunch_change_amount integer,
    lunch_change_reason_type text,
    lunch_change_reason_note text,
    CONSTRAINT work_entries_break_minutes_check CHECK ((break_minutes >= 0)),
    CONSTRAINT work_entries_transport_cost_check CHECK ((transport_cost >= 0)),
    CONSTRAINT work_entries_lunch_change_amount_check CHECK ((lunch_change_amount IS NULL OR lunch_change_amount >= 0)),
    CONSTRAINT work_entries_lunch_change_reason_type_check CHECK ((lunch_change_reason_type IS NULL OR lunch_change_reason_type = ANY (ARRAY['in_kind'::text, 'other'::text]))),
    CONSTRAINT work_entries_lunch_change_consistency_check CHECK (
        ((lunch_change_amount IS NULL) AND (lunch_change_reason_type IS NULL))
        OR ((lunch_change_amount IS NOT NULL) AND (lunch_change_reason_type IS NOT NULL)
            AND (lunch_change_reason_type <> 'other' OR (lunch_change_reason_note IS NOT NULL AND length(TRIM(BOTH FROM lunch_change_reason_note)) > 0)))
    )
);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: advance_payments advance_payments_employee_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_payments
    ADD CONSTRAINT advance_payments_employee_id_work_date_key UNIQUE (employee_id, work_date);


--
-- Name: advance_payments advance_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_payments
    ADD CONSTRAINT advance_payments_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: clock_events clock_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_events
    ADD CONSTRAINT clock_events_pkey PRIMARY KEY (id);


--
-- Name: employees employees_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: employees employees_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_email_key UNIQUE (email);


--
-- Name: employees employees_employee_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_no_key UNIQUE (employee_no);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: lunch_allowance_rates lunch_allowance_rates_employee_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lunch_allowance_rates
    ADD CONSTRAINT lunch_allowance_rates_employee_id_effective_from_key UNIQUE (employee_id, effective_from);


--
-- Name: lunch_allowance_rates lunch_allowance_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lunch_allowance_rates
    ADD CONSTRAINT lunch_allowance_rates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: pay_periods pay_periods_period_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_periods
    ADD CONSTRAINT pay_periods_period_label_key UNIQUE (period_label);


--
-- Name: pay_periods pay_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_periods
    ADD CONSTRAINT pay_periods_pkey PRIMARY KEY (id);


--
-- Name: pay_periods pay_periods_start_date_end_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_periods
    ADD CONSTRAINT pay_periods_start_date_end_date_key UNIQUE (start_date, end_date);


--
-- Name: payslips payslips_employee_id_pay_period_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_pay_period_id_key UNIQUE (employee_id, pay_period_id);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: shift_assignments shift_assignments_employee_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_employee_id_work_date_key UNIQUE (employee_id, work_date);


--
-- Name: shift_assignments shift_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_pkey PRIMARY KEY (id);


--
-- Name: shift_locks shift_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_locks
    ADD CONSTRAINT shift_locks_pkey PRIMARY KEY (employee_id, work_date);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: punch_alerts punch_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_alerts
    ADD CONSTRAINT punch_alerts_pkey PRIMARY KEY (employee_id, work_date, kind);


--
-- Name: shift_modes shift_modes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_modes
    ADD CONSTRAINT shift_modes_pkey PRIMARY KEY (period_key);


--
-- Name: tax_reports tax_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_reports
    ADD CONSTRAINT tax_reports_pkey PRIMARY KEY (id);


--
-- Name: tax_settings tax_settings_employee_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_settings
    ADD CONSTRAINT tax_settings_employee_id_effective_from_key UNIQUE (employee_id, effective_from);


--
-- Name: tax_settings tax_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_settings
    ADD CONSTRAINT tax_settings_pkey PRIMARY KEY (id);


--
-- Name: wage_rates wage_rates_employee_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wage_rates
    ADD CONSTRAINT wage_rates_employee_id_effective_from_key UNIQUE (employee_id, effective_from);


--
-- Name: wage_rates wage_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wage_rates
    ADD CONSTRAINT wage_rates_pkey PRIMARY KEY (id);


--
-- Name: withholding_tax_table withholding_tax_table_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withholding_tax_table
    ADD CONSTRAINT withholding_tax_table_pkey PRIMARY KEY (id);


--
-- Name: withholding_tax_table withholding_tax_table_year_min_amount_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withholding_tax_table
    ADD CONSTRAINT withholding_tax_table_year_min_amount_key UNIQUE (year, min_amount);


--
-- Name: work_entries work_entries_employee_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_entries
    ADD CONSTRAINT work_entries_employee_id_work_date_key UNIQUE (employee_id, work_date);


--
-- Name: work_entries work_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_entries
    ADD CONSTRAINT work_entries_pkey PRIMARY KEY (id);


--
-- Name: activity_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_logs_created_at_idx ON public.activity_logs USING btree (created_at DESC);


--
-- Name: advance_payments_work_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX advance_payments_work_date_idx ON public.advance_payments USING btree (work_date);


--
-- Name: clock_events_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clock_events_employee_idx ON public.clock_events USING btree (employee_id, created_at DESC);


--
-- Name: shift_assignments_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_assignments_date_idx ON public.shift_assignments USING btree (work_date);


--
-- Name: app_settings app_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: employees employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: work_entries work_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_entries_updated_at BEFORE UPDATE ON public.work_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: work_entries work_entries_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_entries_audit BEFORE INSERT OR UPDATE ON public.work_entries FOR EACH ROW EXECUTE FUNCTION public.set_work_entry_audit();


--
-- Name: activity_logs activity_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: advance_payments advance_payments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_payments
    ADD CONSTRAINT advance_payments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: advance_payments advance_payments_work_entry_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_payments
    ADD CONSTRAINT advance_payments_work_entry_fkey FOREIGN KEY (employee_id, work_date) REFERENCES public.work_entries(employee_id, work_date) ON UPDATE CASCADE;


--
-- Name: clock_events clock_events_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_events
    ADD CONSTRAINT clock_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: clock_events clock_events_work_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_events
    ADD CONSTRAINT clock_events_work_entry_id_fkey FOREIGN KEY (work_entry_id) REFERENCES public.work_entries(id) ON DELETE SET NULL;


--
-- Name: employees employees_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lunch_allowance_rates lunch_allowance_rates_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lunch_allowance_rates
    ADD CONSTRAINT lunch_allowance_rates_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.employees(id);


--
-- Name: notifications notifications_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.employees(id);


--
-- Name: payslips payslips_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: payslips payslips_pay_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pay_period_id_fkey FOREIGN KEY (pay_period_id) REFERENCES public.pay_periods(id) ON DELETE CASCADE;


--
-- Name: shift_assignments shift_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: shift_locks shift_locks_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_locks
    ADD CONSTRAINT shift_locks_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: punch_alerts punch_alerts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punch_alerts
    ADD CONSTRAINT punch_alerts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: tax_reports tax_reports_pay_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_reports
    ADD CONSTRAINT tax_reports_pay_period_id_fkey FOREIGN KEY (pay_period_id) REFERENCES public.pay_periods(id) ON DELETE CASCADE;


--
-- Name: tax_settings tax_settings_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_settings
    ADD CONSTRAINT tax_settings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: wage_rates wage_rates_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wage_rates
    ADD CONSTRAINT wage_rates_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: work_entries work_entries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_entries
    ADD CONSTRAINT work_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: work_entries work_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_entries
    ADD CONSTRAINT work_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: work_entries work_entries_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_entries
    ADD CONSTRAINT work_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_logs activity_logs_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_logs_admin_select ON public.activity_logs FOR SELECT USING (public.is_admin());


--
-- Name: advance_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advance_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: advance_payments advance_payments_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advance_payments_admin ON public.advance_payments USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: advance_payments advance_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advance_payments_select ON public.advance_payments FOR SELECT USING (((employee_id = public.current_employee_id()) OR public.is_admin()));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_admin_all ON public.app_settings USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: app_settings app_settings_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_admin_select ON public.app_settings FOR SELECT USING (public.is_admin());


--
-- Name: clock_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;

--
-- Name: clock_events clock_events_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clock_events_admin ON public.clock_events USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: clock_events clock_events_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clock_events_insert_self ON public.clock_events FOR INSERT WITH CHECK ((employee_id = public.current_employee_id()));


--
-- Name: clock_events clock_events_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clock_events_select_self ON public.clock_events FOR SELECT USING ((employee_id = public.current_employee_id()));


--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_admin_all ON public.employees USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: employees employees_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select_self ON public.employees FOR SELECT USING (((auth_user_id = auth.uid()) OR public.is_admin()));


--
-- Name: lunch_allowance_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lunch_allowance_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: lunch_allowance_rates lunch_allowance_rates_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lunch_allowance_rates_admin ON public.lunch_allowance_rates USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: lunch_allowance_rates lunch_allowance_rates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lunch_allowance_rates_select ON public.lunch_allowance_rates FOR SELECT USING (((employee_id = public.current_employee_id()) OR public.is_admin()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_admin ON public.notifications USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (((recipient_id = public.current_employee_id()) OR (recipient_id IS NULL) OR public.is_admin()));


--
-- Name: pay_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_periods pay_periods_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pay_periods_admin ON public.pay_periods USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: pay_periods pay_periods_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pay_periods_select ON public.pay_periods FOR SELECT USING (true);


--
-- Name: payslips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

--
-- Name: payslips payslips_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_admin ON public.payslips USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: payslips payslips_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_select ON public.payslips FOR SELECT USING (((employee_id = public.current_employee_id()) OR public.is_admin()));


--
-- Name: shift_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_assignments shift_assignments_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_assignments_admin ON public.shift_assignments TO authenticated USING ((public.is_admin() AND (NOT public.is_shift_locked(employee_id, work_date)))) WITH CHECK ((public.is_admin() AND (NOT public.is_shift_locked(employee_id, work_date))));


--
-- Name: shift_assignments shift_assignments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_assignments_select ON public.shift_assignments FOR SELECT USING (true);


--
-- Name: shift_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: punch_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.punch_alerts ENABLE ROW LEVEL SECURITY;


--
-- Name: shift_locks shift_locks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_locks_select ON public.shift_locks FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: shift_locks shift_locks_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_locks_self_insert ON public.shift_locks FOR INSERT WITH CHECK ((employee_id = public.current_employee_id()));


--
-- Name: shift_locks shift_locks_self_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_locks_self_delete ON public.shift_locks FOR DELETE USING ((employee_id = public.current_employee_id()));


--
-- Name: push_subscriptions push_subscriptions_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_self ON public.push_subscriptions USING ((employee_id = public.current_employee_id())) WITH CHECK ((employee_id = public.current_employee_id()));


--
-- Name: punch_alerts punch_alerts_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punch_alerts_admin_read ON public.punch_alerts FOR SELECT USING (public.is_admin());


--
-- Name: shift_assignments shift_assignments_self_draft_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_assignments_self_draft_delete ON public.shift_assignments FOR DELETE USING (((employee_id = public.current_employee_id()) AND public.is_shift_draft(work_date)));


--
-- Name: shift_assignments shift_assignments_self_draft_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_assignments_self_draft_insert ON public.shift_assignments FOR INSERT WITH CHECK (((employee_id = public.current_employee_id()) AND public.is_shift_draft(work_date)));


--
-- Name: shift_assignments shift_assignments_self_draft_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_assignments_self_draft_update ON public.shift_assignments FOR UPDATE USING (((employee_id = public.current_employee_id()) AND public.is_shift_draft(work_date))) WITH CHECK (((employee_id = public.current_employee_id()) AND public.is_shift_draft(work_date)));


--
-- Name: shift_modes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_modes ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_modes shift_modes_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_modes_admin ON public.shift_modes USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: shift_modes shift_modes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_modes_select ON public.shift_modes FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: tax_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_reports tax_reports_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_reports_admin ON public.tax_reports USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: tax_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_settings tax_settings_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_settings_admin ON public.tax_settings USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: tax_settings tax_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_settings_select ON public.tax_settings FOR SELECT USING (((employee_id = public.current_employee_id()) OR public.is_admin()));


--
-- Name: withholding_tax_table tax_table_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_table_admin ON public.withholding_tax_table USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: withholding_tax_table tax_table_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_table_select ON public.withholding_tax_table FOR SELECT USING (true);


--
-- Name: wage_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wage_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: wage_rates wage_rates_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wage_rates_admin ON public.wage_rates USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wage_rates wage_rates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wage_rates_select ON public.wage_rates FOR SELECT USING (((employee_id = public.current_employee_id()) OR public.is_admin()));


--
-- Name: withholding_tax_table; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.withholding_tax_table ENABLE ROW LEVEL SECURITY;

--
-- Name: work_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: work_entries work_entries_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_entries_admin ON public.work_entries USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: work_entries work_entries_delete_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_entries_delete_self ON public.work_entries FOR DELETE USING (((employee_id = public.current_employee_id()) AND public.is_period_open(work_date)));


--
-- Name: work_entries work_entries_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_entries_insert_self ON public.work_entries FOR INSERT WITH CHECK (((employee_id = public.current_employee_id()) AND public.is_period_open(work_date)));


--
-- Name: work_entries work_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_entries_select ON public.work_entries FOR SELECT USING (((employee_id = public.current_employee_id()) OR public.is_admin()));


--
-- Name: work_entries work_entries_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_entries_update_self ON public.work_entries FOR UPDATE USING (((employee_id = public.current_employee_id()) AND public.is_period_open(work_date))) WITH CHECK (((employee_id = public.current_employee_id()) AND public.is_period_open(work_date)));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION count_employee_work_entries(p_employee_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_employee_work_entries(p_employee_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_employee_work_entries(p_employee_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.count_employee_work_entries(p_employee_id uuid) TO service_role;


--
-- Name: FUNCTION current_employee_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_employee_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_employee_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_employee_id() TO service_role;


--
-- Name: FUNCTION delete_employee(p_employee_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_employee(p_employee_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_employee(p_employee_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_employee(p_employee_id uuid) TO service_role;


--
-- Name: FUNCTION email_registered(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.email_registered(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_registered(p_email text) TO anon;
GRANT ALL ON FUNCTION public.email_registered(p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.email_registered(p_email text) TO service_role;


--
-- Name: FUNCTION get_break_settings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_break_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_break_settings() TO anon;
GRANT ALL ON FUNCTION public.get_break_settings() TO authenticated;
GRANT ALL ON FUNCTION public.get_break_settings() TO service_role;


--
-- Name: FUNCTION get_clock_settings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_clock_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_clock_settings() TO authenticated;
GRANT ALL ON FUNCTION public.get_clock_settings() TO service_role;


--
-- Name: FUNCTION get_contact_settings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_contact_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_contact_settings() TO anon;
GRANT ALL ON FUNCTION public.get_contact_settings() TO authenticated;
GRANT ALL ON FUNCTION public.get_contact_settings() TO service_role;


--
-- Name: FUNCTION get_employee_names(p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_employee_names(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_employee_names(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_employee_names(p_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_shift_roster(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_shift_roster() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_shift_roster() TO authenticated;
GRANT ALL ON FUNCTION public.get_shift_roster() TO service_role;


--
-- Name: FUNCTION get_shift_settings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_shift_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_shift_settings() TO authenticated;
GRANT ALL ON FUNCTION public.get_shift_settings() TO service_role;


--
-- Name: FUNCTION get_shift_status(p_start date, p_end date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_shift_status(p_start date, p_end date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_shift_status(p_start date, p_end date) TO authenticated;
GRANT ALL ON FUNCTION public.get_shift_status(p_start date, p_end date) TO service_role;


--
-- Name: FUNCTION get_timesheet_lock(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_timesheet_lock() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_timesheet_lock() TO anon;
GRANT ALL ON FUNCTION public.get_timesheet_lock() TO authenticated;
GRANT ALL ON FUNCTION public.get_timesheet_lock() TO service_role;


--
-- Name: FUNCTION get_work_rules_meta(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_work_rules_meta() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_work_rules_meta() TO anon;
GRANT ALL ON FUNCTION public.get_work_rules_meta() TO authenticated;
GRANT ALL ON FUNCTION public.get_work_rules_meta() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_period_open(d date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_period_open(d date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_period_open(d date) TO authenticated;
GRANT ALL ON FUNCTION public.is_period_open(d date) TO service_role;


--
-- Name: FUNCTION is_shift_draft(d date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_shift_draft(d date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_shift_draft(d date) TO anon;
GRANT ALL ON FUNCTION public.is_shift_draft(d date) TO authenticated;
GRANT ALL ON FUNCTION public.is_shift_draft(d date) TO service_role;


--
-- Name: FUNCTION is_shift_locked(p_employee_id uuid, d date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_shift_locked(p_employee_id uuid, d date) TO anon;
GRANT ALL ON FUNCTION public.is_shift_locked(p_employee_id uuid, d date) TO authenticated;
GRANT ALL ON FUNCTION public.is_shift_locked(p_employee_id uuid, d date) TO service_role;


--
-- Name: FUNCTION update_own_profile(p_nickname text, p_name text, p_furigana text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_own_profile(p_nickname text, p_name text, p_furigana text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_own_profile(p_nickname text, p_name text, p_furigana text) TO authenticated;


--
-- Name: FUNCTION notify_first_login(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_first_login() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_first_login() TO authenticated;


--
-- Name: FUNCTION link_employee_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.link_employee_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_employee_account() TO authenticated;
GRANT ALL ON FUNCTION public.link_employee_account() TO service_role;


--
-- Name: FUNCTION log_activity(p_action text, p_detail text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_activity(p_action text, p_detail text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_activity(p_action text, p_detail text) TO anon;
GRANT ALL ON FUNCTION public.log_activity(p_action text, p_detail text) TO authenticated;
GRANT ALL ON FUNCTION public.log_activity(p_action text, p_detail text) TO service_role;


--
-- Name: FUNCTION norm_hhmm(t text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.norm_hhmm(t text) TO anon;
GRANT ALL ON FUNCTION public.norm_hhmm(t text) TO authenticated;
GRANT ALL ON FUNCTION public.norm_hhmm(t text) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION set_work_entry_audit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_work_entry_audit() TO anon;
GRANT ALL ON FUNCTION public.set_work_entry_audit() TO authenticated;
GRANT ALL ON FUNCTION public.set_work_entry_audit() TO service_role;


--
-- Name: FUNCTION shift_period_key(d date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.shift_period_key(d date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.shift_period_key(d date) TO anon;
GRANT ALL ON FUNCTION public.shift_period_key(d date) TO authenticated;
GRANT ALL ON FUNCTION public.shift_period_key(d date) TO service_role;


--
-- Name: TABLE activity_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_logs TO anon;
GRANT ALL ON TABLE public.activity_logs TO authenticated;
GRANT ALL ON TABLE public.activity_logs TO service_role;


--
-- Name: TABLE advance_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.advance_payments TO anon;
GRANT ALL ON TABLE public.advance_payments TO authenticated;
GRANT ALL ON TABLE public.advance_payments TO service_role;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_settings TO anon;
GRANT ALL ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;


--
-- Name: TABLE clock_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clock_events TO anon;
GRANT ALL ON TABLE public.clock_events TO authenticated;
GRANT ALL ON TABLE public.clock_events TO service_role;


--
-- Name: TABLE employees; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employees TO anon;
GRANT ALL ON TABLE public.employees TO authenticated;
GRANT ALL ON TABLE public.employees TO service_role;


--
-- Name: TABLE lunch_allowance_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lunch_allowance_rates TO anon;
GRANT ALL ON TABLE public.lunch_allowance_rates TO authenticated;
GRANT ALL ON TABLE public.lunch_allowance_rates TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE pay_periods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pay_periods TO anon;
GRANT ALL ON TABLE public.pay_periods TO authenticated;
GRANT ALL ON TABLE public.pay_periods TO service_role;


--
-- Name: TABLE payslips; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payslips TO anon;
GRANT ALL ON TABLE public.payslips TO authenticated;
GRANT ALL ON TABLE public.payslips TO service_role;


--
-- Name: TABLE shift_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shift_assignments TO anon;
GRANT ALL ON TABLE public.shift_assignments TO authenticated;
GRANT ALL ON TABLE public.shift_assignments TO service_role;


--
-- Name: TABLE shift_locks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shift_locks TO anon;
GRANT ALL ON TABLE public.shift_locks TO authenticated;
GRANT ALL ON TABLE public.shift_locks TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: TABLE punch_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.punch_alerts TO authenticated;


--
-- Name: TABLE shift_modes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shift_modes TO anon;
GRANT ALL ON TABLE public.shift_modes TO authenticated;
GRANT ALL ON TABLE public.shift_modes TO service_role;


--
-- Name: TABLE tax_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tax_reports TO anon;
GRANT ALL ON TABLE public.tax_reports TO authenticated;
GRANT ALL ON TABLE public.tax_reports TO service_role;


--
-- Name: TABLE tax_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tax_settings TO anon;
GRANT ALL ON TABLE public.tax_settings TO authenticated;
GRANT ALL ON TABLE public.tax_settings TO service_role;


--
-- Name: TABLE wage_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wage_rates TO anon;
GRANT ALL ON TABLE public.wage_rates TO authenticated;
GRANT ALL ON TABLE public.wage_rates TO service_role;


--
-- Name: TABLE withholding_tax_table; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.withholding_tax_table TO anon;
GRANT ALL ON TABLE public.withholding_tax_table TO authenticated;
GRANT ALL ON TABLE public.withholding_tax_table TO service_role;


--
-- Name: TABLE work_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.work_entries TO anon;
GRANT ALL ON TABLE public.work_entries TO authenticated;
GRANT ALL ON TABLE public.work_entries TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict t4mtFMaa49lZ77T9Fq4La1XdZEZ5MOyYACBmhjO6T47as4PGVUoyVPLh05YI073

