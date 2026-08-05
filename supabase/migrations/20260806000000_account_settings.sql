-- アカウント設定機能の追加。
--
-- 1) 従業員本人がニックネーム・氏名・ふりがなを自分で変更できるようにする
--    (SECURITY DEFINER関数。employees テーブルへの直接UPDATE権限は与えない。
--     authenticated ロールへの列単位GRANTは管理者用の employees_admin_all ポリシーと
--     同じロールに適用されてしまい、管理者が他の列を更新できなくなるため使えない。
--     関数側で「自分の行の、この3列だけ」に固定して安全に絞り込む)
-- 2) 未打刻通知を「出勤」「退勤」で別々にオン/オフできるようにする
--    (旧: notify_missing_punch 1つ → 新: notify_missing_punch_in / _out の2つ)

-- ============================================================
-- 1. 本人によるプロフィール更新
-- ============================================================
create or replace function public.update_own_profile(
  p_nickname text,
  p_name text,
  p_furigana text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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

comment on function public.update_own_profile(text, text, text) is
  '本人がニックネーム・氏名・ふりがなを変更する。自分の行のこの3列のみ更新可能。';

revoke all on function public.update_own_profile(text, text, text) from public;
grant execute on function public.update_own_profile(text, text, text) to authenticated;

-- ============================================================
-- 2. 未打刻通知を出勤/退勤で分離
-- ============================================================
-- 既存の notify_missing_punch(単一スイッチ)の値を、新しい2つのキーへ引き継ぐ。
-- 未設定(=既定オン)だった場合も両方オンにする。
insert into app_settings (key, value)
select 'notify_missing_punch_in',
       coalesce((select value from app_settings where key = 'notify_missing_punch'), 'true')
where not exists (select 1 from app_settings where key = 'notify_missing_punch_in');

insert into app_settings (key, value)
select 'notify_missing_punch_out',
       coalesce((select value from app_settings where key = 'notify_missing_punch'), 'true')
where not exists (select 1 from app_settings where key = 'notify_missing_punch_out');

-- collect_punch_alerts() を出勤/退勤それぞれの設定を見るように変更
create or replace function public.collect_punch_alerts()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
