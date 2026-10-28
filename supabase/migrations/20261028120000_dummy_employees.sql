-- ============================================================
-- ダミー従業員(本番で使うテスト用の見えない従業員。2026-10-28 オーナー依頼)
--
-- - employees.status に 'dummy' を足す。ダミーは在職者と同じようにログイン・打刻・シフト・明細の受け取りができる
-- - ダミー(とその記録)を見られるのは「システム管理者(オーナー以外の管理者)」と「ダミー本人」だけ。
--   オーナー・一般の従業員には、給与管理・経費管理のどの画面にも出ない
-- - 守り方: ダミーの行を隠す RESTRICTIVE ポリシーを、従業員と従業員に紐づく表に足す
--   (RLS を通らない SECURITY DEFINER の関数は、それぞれで絞る)。
--   service_role(通知 API など)は RLS を通らないので、送り先を選ぶ関数側で絞る
-- - 税理士向けの集計・月の合計からは画面側(TypeScript)で外す
-- ⚠️ 経費管理(oominami-business)と DB を共用。経費の CLAUDE.md・設計書にも同じ決まりを書く
-- ============================================================

alter table public.employees drop constraint employees_status_check;
alter table public.employees add constraint employees_status_check
  check (status in ('active', 'retired', 'dummy'));

-- ------------------------------------------------------------
-- ダミーを見てよい人か: システム管理者(オーナー以外の管理者)・ダミー本人
-- ------------------------------------------------------------
create or replace function public.can_see_dummies()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and ((status = 'active' and is_admin and not is_owner) or status = 'dummy')
  );
$$;
revoke all on function public.can_see_dummies() from public, anon;
grant execute on function public.can_see_dummies() to authenticated;

-- ダミーの employees.id / auth_user_id の一覧(ポリシーで1回だけ評価させるため配列で返す)
create or replace function public.dummy_employee_ids()
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(array_agg(id), '{}') from public.employees where status = 'dummy';
$$;
revoke all on function public.dummy_employee_ids() from public, anon;
grant execute on function public.dummy_employee_ids() to authenticated;

create or replace function public.dummy_auth_ids()
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(array_agg(auth_user_id), '{}') from public.employees
  where status = 'dummy' and auth_user_id is not null;
$$;
revoke all on function public.dummy_auth_ids() from public, anon;
grant execute on function public.dummy_auth_ids() to authenticated;

-- ------------------------------------------------------------
-- ダミーの行を隠す(RESTRICTIVE: 既存のポリシーに「かつ」で掛かる。ダミー以外の行には影響しない)
-- (select ...) で包むのは、行ごとではなく1回だけ評価させるため
-- ------------------------------------------------------------
create policy employees_hide_dummy on public.employees
  as restrictive for all to authenticated
  using (status <> 'dummy' or (select public.can_see_dummies()))
  with check (status <> 'dummy' or (select public.can_see_dummies()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'advance_payments', 'app_guide_views', 'clock_events', 'employee_profiles', 'lunch_allowance_rates',
    'payslips', 'punch_alerts', 'push_subscriptions', 'shift_assignments', 'shift_change_notices',
    'shift_locks', 'shift_reminder_settings', 'shift_reminders', 'tax_settings', 'wage_rates', 'work_entries'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (employee_id is null or not (employee_id = any ((select public.dummy_employee_ids()))) '
      'or (select public.can_see_dummies()))',
      t || '_hide_dummy', t
    );
  end loop;
end $$;

create policy activity_logs_hide_dummy on public.activity_logs
  as restrictive for all to authenticated
  using (actor_id is null or not (actor_id = any ((select public.dummy_employee_ids())))
         or (select public.can_see_dummies()));

-- お知らせ(ダミーあての個別連絡)
create policy notifications_hide_dummy on public.notifications
  as restrictive for all to authenticated
  using (recipient_id is null or not (recipient_id = any ((select public.dummy_employee_ids())))
         or (select public.can_see_dummies()));

-- 経費管理の表
create policy expense_entries_hide_dummy on public.expense_entries
  as restrictive for all to authenticated
  using (
    (select public.can_see_dummies())
    or not (
      coalesce(staff_id = any ((select public.dummy_employee_ids())), false)
      or coalesce(advanced_by = any ((select public.dummy_employee_ids())), false)
      or coalesce(created_by = any ((select public.dummy_auth_ids())), false)
    )
  );
create policy expense_recurring_hide_dummy on public.expense_recurring
  as restrictive for all to authenticated
  using (
    (select public.can_see_dummies())
    or not (
      coalesce(staff_id = any ((select public.dummy_employee_ids())), false)
      or coalesce(created_by = any ((select public.dummy_auth_ids())), false)
    )
  );
create policy ops_activity_logs_hide_dummy on public.ops_activity_logs
  as restrictive for all to authenticated
  using (user_id is null or not (user_id = any ((select public.dummy_auth_ids())))
         or (select public.can_see_dummies()));
create policy ops_guide_views_hide_dummy on public.ops_guide_views
  as restrictive for all to authenticated
  using (user_id is null or not (user_id = any ((select public.dummy_auth_ids())))
         or (select public.can_see_dummies()));

-- ------------------------------------------------------------
-- 「本人が在職中か」の判定でダミーも在職と同じに扱う(ログイン・権限・本人への通知)
-- 中身は変えず status = 'active' だけを置き換える(各関数の本体は既存のマイグレーション参照)
-- ------------------------------------------------------------
do $$
declare
  f text;
  d text;
begin
  foreach f in array array[
    'public.is_admin()', 'public.is_leader()', 'public.is_owner()', 'public.is_shift_member(uuid)',
    'public.email_registered(text)', 'public.app_guide_view_start(uuid)', 'public.calendar_feed(text)',
    'public.ops_is_staff()', 'public.ops_can_view_expense(uuid, uuid, uuid)',
    'public.collect_shift_change_notices()', 'public.collect_shift_reminders()'
  ] loop
    d := pg_get_functiondef(f::regprocedure);
    if position($q$status = 'active'$q$ in d) = 0 then
      raise exception '%: 置き換える箇所がありません', f;
    end if;
    execute replace(d, $q$status = 'active'$q$, $q$status in ('active', 'dummy')$q$);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 一覧を返す SECURITY DEFINER の関数(RLS を通らない)でダミーを絞る
-- ------------------------------------------------------------
create or replace function public.get_shift_roster()
returns table (id uuid, name text, nickname text, color text)
language sql
security definer
set search_path to 'public'
as $$
  select id, name, nickname, color
  from employees
  where (status = 'active' or (status = 'dummy' and public.can_see_dummies())) and is_admin = false
  order by employee_no;
$$;

create or replace function public.get_employee_names(p_ids uuid[])
returns table (id uuid, display_name text)
language sql
security definer
set search_path to 'public'
as $$
  select id, coalesce(nullif(trim(nickname), ''), name)
  from employees
  where id = any(p_ids) and (status <> 'dummy' or public.can_see_dummies());
$$;

create or replace function public.ops_staff_list()
returns table (id uuid, display_name text, color text, is_active boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select e.id,
         coalesce(nullif(trim(e.nickname), ''), e.name),
         e.color,
         e.status in ('active', 'dummy')
  from public.employees e
  where public.ops_is_staff() and (e.status <> 'dummy' or public.can_see_dummies())
  order by e.employee_no;
$$;

create or replace function public.ops_account_names(p_ids uuid[])
returns table (auth_user_id uuid, display_name text, is_shared boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select e.auth_user_id, coalesce(nullif(trim(e.nickname), ''), e.name), false
  from public.employees e
  where public.ops_is_staff() and e.auth_user_id = any (p_ids)
    and (e.status <> 'dummy' or public.can_see_dummies())
  union all
  select s.auth_user_id, s.label, true
  from public.ops_shared_accounts s
  where public.ops_is_staff() and s.auth_user_id = any (p_ids);
$$;

-- 長い関数は、該当の1か所だけを置き換える(見つからなければ止める)
create or replace function pg_temp.patch(p_fn text, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  d text := pg_get_functiondef(p_fn::regprocedure);
begin
  if position(p_old in d) = 0 then
    raise exception '%: 置き換える箇所がありません', p_fn;
  end if;
  execute replace(d, p_old, p_new);
end;
$$;

-- 予定と実績の突き合わせ(締め・シフト画面)
select pg_temp.patch(
  'public.get_shift_status(date, date)',
  $q$  full outer join act a on p.eid = a.eid and p.wd = a.wd;$q$,
  $q$  full outer join act a on p.eid = a.eid and p.wd = a.wd
  where not (coalesce(p.eid, a.eid) = any (public.dummy_employee_ids())) or public.can_see_dummies();$q$
);

-- 端末一覧・試験中の名前
select pg_temp.patch(
  'public.device_list()',
  $q$  where public.is_admin()
$q$,
  $q$  where public.is_admin()
    and (e.status is distinct from 'dummy' or public.can_see_dummies())
$q$
);
select pg_temp.patch(
  'public.device_enforce_test_list()',
  $q$  where public.is_admin()
$q$,
  $q$  where public.is_admin()
    and (coalesce(e.status, e2.status, '') <> 'dummy' or public.can_see_dummies())
$q$
);

-- 管理者あての通知: ダミーのことはオーナーに送らない(システム管理者には送る)
select pg_temp.patch(
  'public.device_notify_pending(uuid, text)',
  $q$where e.is_admin and e.status = 'active' and e.auth_user_id is distinct from v_owner;$q$,
  $q$where e.is_admin and e.status = 'active' and e.auth_user_id is distinct from v_owner
    and not (e.is_owner and exists (select 1 from employees x where x.auth_user_id = v_owner and x.status = 'dummy'));$q$
);
select pg_temp.patch(
  'public.notify_first_login()',
  $q$  where e.is_admin and e.status = 'active';$q$,
  $q$  where e.is_admin and e.status = 'active'
    and not (e.is_owner and exists (select 1 from employees x where x.id = v_id and x.status = 'dummy'));$q$
);
-- 未打刻の通知はオーナーも受け取る一括の通知なので、ダミーは対象にしない
select pg_temp.patch(
  'public.collect_punch_alerts()',
  $q$    from shift_assignments sa
    join slot_default sd on sd.slot = sa.slot$q$,
  $q$    from shift_assignments sa
    join employees de on de.id = sa.employee_id and de.status <> 'dummy'
    join slot_default sd on sd.slot = sa.slot$q$
);
