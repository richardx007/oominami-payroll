-- アプリの解説（操作説明の動画・資料へのリンク集）
-- 2026-09-26: 管理者向けの操作説明ムービー（Google ドライブに置く）などを、メニュー「アプリの解説」から開けるようにする。
-- 登録・変更は管理者が設定画面で行う。公開対象（管理者／従業員。両方も可）ごとに見える項目を分ける。
--
-- 管理者は全件、従業員は for_employee の項目だけ読める。書き込みは管理者のみ。

create table if not exists public.app_guides (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 60),
  url text not null check (url ~ '^https?://' and length(url) <= 1000),
  summary text not null default '' check (length(summary) <= 400),
  for_admin boolean not null default true,
  for_employee boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null,
  -- 公開対象は少なくとも1つ
  check (for_admin or for_employee)
);

comment on table public.app_guides is
  'アプリの解説(操作説明の動画・資料へのリンク)。for_admin/for_employee が公開対象。従業員は for_employee の行だけ読める。';

alter table public.app_guides enable row level security;

drop policy if exists app_guides_select on public.app_guides;
create policy app_guides_select on public.app_guides
  for select to authenticated using (is_admin() or for_employee);

drop policy if exists app_guides_admin on public.app_guides;
create policy app_guides_admin on public.app_guides
  for all to authenticated using (is_admin()) with check (is_admin());
