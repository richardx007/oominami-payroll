-- 昼食補助費を「全社共通の定額」から「従業員ごとの金額(時給と同じ履歴管理)」に変更する。
-- 目的: 特定の人・日だけ昼食補助を除外したい(現物支給等)、特定の人だけ試用期間中は
-- 昼食補助を除外したい、という要望に対応するため。
--
-- 1. wage_rates と同形の lunch_allowance_rates を新設し、既存の全社共通レート(allowance_settings)
--    の履歴を全従業員(非管理者)にコピーして初期値とする。
-- 2. allowance_settings は役割が重複するため廃止する。
-- 3. work_entries に「その日だけの昼食費上書き」用の列を追加する(管理者のみ入力想定。
--    RLSはwork_entriesの既存ポリシーに従うが、上書き列はアプリ側(管理者用アクション)でのみ書き込む)。

create table public.lunch_allowance_rates (
    id uuid default gen_random_uuid() not null,
    employee_id uuid not null,
    lunch_allowance integer not null,
    effective_from date not null,
    created_at timestamp with time zone default now() not null,
    constraint lunch_allowance_rates_lunch_allowance_check check ((lunch_allowance >= 0))
);

alter table only public.lunch_allowance_rates
    add constraint lunch_allowance_rates_pkey primary key (id);

alter table only public.lunch_allowance_rates
    add constraint lunch_allowance_rates_employee_id_effective_from_key unique (employee_id, effective_from);

alter table only public.lunch_allowance_rates
    add constraint lunch_allowance_rates_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete cascade;

alter table public.lunch_allowance_rates enable row level security;

create policy lunch_allowance_rates_admin on public.lunch_allowance_rates using (public.is_admin()) with check (public.is_admin());

create policy lunch_allowance_rates_select on public.lunch_allowance_rates for select using (((employee_id = public.current_employee_id()) or public.is_admin()));

-- 既存の全社共通レート履歴を、全従業員(非管理者)の初期値としてコピーする
insert into public.lunch_allowance_rates (employee_id, lunch_allowance, effective_from)
select e.id, a.lunch_allowance_per_day, a.effective_from
from public.employees e
cross join public.allowance_settings a
where e.is_admin = false;

drop table public.allowance_settings;

-- work_entries: 当日だけ昼食補助を上書きする(管理者のみ入力)。
-- lunch_change_amount = その日の最終的な昼食補助額(上書き。差分ではない)。
-- 未入力(null)なら lunch_allowance_rates の通常額をそのまま使う。
alter table public.work_entries
  add column lunch_change_amount integer,
  add column lunch_change_reason_type text,
  add column lunch_change_reason_note text;

alter table public.work_entries
  add constraint work_entries_lunch_change_amount_check check ((lunch_change_amount is null or lunch_change_amount >= 0)),
  add constraint work_entries_lunch_change_reason_type_check check ((lunch_change_reason_type is null or lunch_change_reason_type = any (array['in_kind'::text, 'other'::text]))),
  add constraint work_entries_lunch_change_consistency_check check (
    (lunch_change_amount is null and lunch_change_reason_type is null)
    or (lunch_change_amount is not null and lunch_change_reason_type is not null
        and (lunch_change_reason_type <> 'other' or (lunch_change_reason_note is not null and length(trim(lunch_change_reason_note)) > 0)))
  );
