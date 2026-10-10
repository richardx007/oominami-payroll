-- 管理者の権限を「オーナー」と「システム管理者」に分ける(2026-10-11 オーナー依頼)。
--
-- - オーナー(employees.is_owner): 従業員の個人情報(住所・電話番号・生年月日)を見られ、編集できる。
-- - システム管理者(is_admin だけ): 個人情報は全角を「＊」・半角を「*」に置き換えた値しか受け取れない
--   (employee_profiles を直接は読めない。employee_profiles_for_admin() が伏せ字にして返す)。
--   源泉徴収票を出しても住所・生年月日は伏せ字になる。
-- - Supabase のダッシュボードから直接テーブルを見れば見えるが、日常使うアプリでは見せない、という位置づけ
--   (オーナーの意向)。
-- - オーナーの付け外しは画面からはできない(SQL で行う)。最初のオーナーは M001(オオミナミオーナー)。

alter table public.employees
  add column is_owner boolean not null default false;

alter table public.employees
  add constraint employees_owner_is_admin check (not is_owner or is_admin);

comment on column public.employees.is_owner is
  'オーナー(管理者のうち、従業員の個人情報を見て編集できる人)。画面からは変更できない。';

update public.employees set is_owner = true where employee_no = 'M001' and is_admin;

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
  );
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- 個人情報: 本人とオーナーだけが直接読める・オーナーは全員分を編集できる
drop policy employee_profiles_select on public.employee_profiles;
drop policy employee_profiles_admin on public.employee_profiles;

create policy employee_profiles_select on public.employee_profiles
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_owner());

create policy employee_profiles_owner on public.employee_profiles
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

comment on table public.employee_profiles is
  '源泉徴収票に載せる本人の住所・電話・生年月日。本人とオーナーだけが読める。システム管理者には employee_profiles_for_admin() が伏せ字にして返す。';

-- 伏せ字: 半角(ASCII・半角カナ)は「*」、それ以外(全角)は「＊」。文字数は変えない
create or replace function public.mask_personal(p text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case when p is null or p = '' then coalesce(p, '')
    else regexp_replace(
      regexp_replace(p, '[\x20-\x7E｡-ﾟ]', '*', 'g'),
      '[^*]', '＊', 'g')
  end;
$$;

-- 管理者向け: 従業員の個人情報(オーナーにはそのまま、システム管理者には伏せ字)
create or replace function public.employee_profiles_for_admin()
returns table (
  employee_id uuid,
  postal_code text,
  address text,
  phone text,
  birth_date text,
  masked boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  select p.employee_id,
         case when o.v then p.postal_code else public.mask_personal(p.postal_code) end,
         case when o.v then p.address else public.mask_personal(p.address) end,
         case when o.v then p.phone else public.mask_personal(p.phone) end,
         case when p.birth_date is null then ''
              when o.v then p.birth_date::text
              else '****-**-**' end,
         not o.v
  from public.employee_profiles p
  cross join (select public.is_owner() as v) o
  where public.is_admin();
$$;

revoke all on function public.employee_profiles_for_admin() from public, anon;
grant execute on function public.employee_profiles_for_admin() to authenticated;

-- オーナーの付け外しはアプリ(ログイン中のユーザー)からはできない。管理者は employees を更新できるため、
-- これが無いとシステム管理者が自分をオーナーにできてしまう。SQL エディタ(auth.uid() が無い)からは変更できる。
create or replace function public.guard_employee_owner()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' and new.is_owner
          or tg_op = 'UPDATE' and new.is_owner is distinct from old.is_owner) then
    raise exception 'オーナーの設定はアプリからは変更できません';
  end if;
  return new;
end;
$$;

create trigger employees_guard_owner
  before insert or update of is_owner on public.employees
  for each row execute function public.guard_employee_owner();
