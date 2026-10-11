-- ログイン画面の「退職済みならログインさせない」確認用。
-- 承認されていない端末からは employees が読めない(端末承認制)ため、ログイン直後に employees を
-- 直接読むと「従業員が見つからない」扱いになり、承認待ちの画面にたどり着けずにログアウトされてしまう。
-- 在職状況だけを、端末の承認とは関係なく本人に返す。
create or replace function public.login_employee_status()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select status from public.employees where auth_user_id = auth.uid();
$$;

comment on function public.login_employee_status() is
  'ログイン直後の在職確認用。本人の employees.status を返す(端末の承認状態に関係なく)。未連携なら null。';

revoke all on function public.login_employee_status() from public, anon;
grant execute on function public.login_employee_status() to authenticated;
