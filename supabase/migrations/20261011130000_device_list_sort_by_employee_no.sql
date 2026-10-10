-- 端末一覧(device_list)を従業員画面と同じ従業員No順にする(2026-10-11 オーナー依頼)。
-- No の無い共有アカウントは最後。同じ人の中では承認待ち→最近使った順。owner_employee_no を返す列に足す。
drop function public.device_list();
create function public.device_list()
returns table (
  id uuid, owner_id uuid, owner_employee_no text, owner_name text, owner_is_admin boolean, is_me boolean, app text, label text, status text,
  approved_how text, approved_at timestamptz, approver_name text, created_at timestamptz, last_seen_at timestamptz
)
language sql stable security definer set search_path to ''
as $$
  select d.id,
         d.auth_user_id as owner_id,
         e.employee_no as owner_employee_no,
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
  order by e.employee_no nulls last, (d.status = 'pending') desc, d.last_seen_at desc;
$$;
revoke all on function public.device_list() from public, anon;
grant execute on function public.device_list() to authenticated;
