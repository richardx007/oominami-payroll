-- 従業員が自分で給与明細PDF・源泉徴収票をダウンロードするための準備(2026-10-10 オーナー依頼)。
--
-- 1. employee_profiles: 源泉徴収票に載せる本人の住所・電話・生年月日。本人が設定画面で入力する。
--    employees に列を足さないのは、employees には本人の UPDATE 権限を与えない方針のため
--    (権限昇格の経路を作らない。氏名等は update_own_profile() 経由)。
-- 2. payslip_issuer_public(): 給与明細PDFの支払元・印と、源泉徴収票の支払者(所在地・名称・電話)。
--    app_settings は管理者しか読めないので、PDFに印字するこれらのキーだけを本人にも返す。

create table public.employee_profiles (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  postal_code text not null default '' check (length(postal_code) <= 10),
  address text not null default '' check (length(address) <= 200),
  phone text not null default '' check (length(phone) <= 20),
  birth_date date,
  updated_at timestamptz not null default now()
);

comment on table public.employee_profiles is
  '源泉徴収票に載せる本人の住所・電話・生年月日。本人が設定画面で入力し、本人と管理者だけが読める。';

alter table public.employee_profiles enable row level security;

create policy employee_profiles_select on public.employee_profiles
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_admin());

create policy employee_profiles_insert_self on public.employee_profiles
  for insert to authenticated
  with check (employee_id = public.current_employee_id());

create policy employee_profiles_update_self on public.employee_profiles
  for update to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

create policy employee_profiles_admin on public.employee_profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.payslip_issuer_public()
returns table (key text, value text)
language sql
stable
security definer
set search_path to ''
as $$
  select s.key, s.value
  from public.app_settings s
  where (public.current_employee_id() is not null)
    and s.key in (
      'company_name',
      'payslip_payer_line1', 'payslip_payer_line2',
      'payslip_seal_data_url', 'payslip_seal_filename', 'payslip_seal_size_mm',
      'employer_name', 'employer_address', 'employer_phone'
    );
$$;

comment on function public.payslip_issuer_public() is
  '給与明細PDFの支払元・印、源泉徴収票の支払者情報(本人のPDF出力用)。ログイン中の従業員・管理者だけが読める。';

revoke all on function public.payslip_issuer_public() from public, anon;
grant execute on function public.payslip_issuer_public() to authenticated;
