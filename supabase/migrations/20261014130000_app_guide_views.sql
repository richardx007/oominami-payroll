-- アプリの解説: 動画の視聴履歴(2026-10-14 オーナー依頼「誰が何の動画を見たか」)
--
-- ・再生画面(/watch/[id])を開くたびに1行(開いた日時)。再生中は、実際に再生した長さを10秒ごとに足していく
--   (先送りした分は数えない。同じところを見直した分は数えるが、動画の長さを上限にする)
-- ・読めるのは管理者だけ。書き込みは下の2つの関数だけ(本人の行しか更新できない)
-- ・経費管理(業務管理)の ops_guide_views は同じ形の別テーブル

create table public.app_guide_views (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.app_guides(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  opened_at timestamptz not null default now(),
  watched_sec numeric(8, 1) not null default 0 check (watched_sec >= 0),
  duration_sec numeric(8, 1) check (duration_sec is null or duration_sec > 0),
  updated_at timestamptz not null default now()
);
comment on table public.app_guide_views is
  'アプリの解説の動画の視聴履歴。再生画面を開くたびに1行。watched_sec = 実際に再生した秒数(動画の長さが上限)。管理者だけが読める。書き込みは app_guide_view_start / app_guide_view_progress だけ。';

create index app_guide_views_opened_at_idx on public.app_guide_views (opened_at desc);
create index app_guide_views_guide_idx on public.app_guide_views (guide_id, opened_at desc);
create index app_guide_views_employee_idx on public.app_guide_views (employee_id);

alter table public.app_guide_views enable row level security;

create policy app_guide_views_admin_select on public.app_guide_views
  for select to authenticated
  using (public.is_admin());

revoke all on table public.app_guide_views from anon;
revoke insert, update, delete, truncate on table public.app_guide_views from authenticated;

-- 再生画面を開いたときに呼ぶ。見られる解説(管理者 = すべて、従業員 = for_employee)のときだけ記録し、行の ID を返す
create or replace function public.app_guide_view_start(p_guide_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_id uuid;
begin
  select e.id into v_employee
  from public.employees e
  where e.id = public.current_employee_id() and e.status = 'active';
  if v_employee is null then
    return null;
  end if;
  if not exists (
    select 1 from public.app_guides g
    where g.id = p_guide_id and g.video_path is not null and (public.is_admin() or g.for_employee)
  ) then
    return null;
  end if;
  insert into public.app_guide_views (guide_id, employee_id) values (p_guide_id, v_employee)
  returning id into v_id;
  return v_id;
end;
$$;

-- 再生中に呼ぶ。p_watched_sec はこの画面で実際に再生した秒数の合計(減らさない)。本人の、12時間以内に開いた行だけ
create or replace function public.app_guide_view_progress(p_view_id uuid, p_watched_sec numeric, p_duration_sec numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration numeric := case when p_duration_sec > 0 and p_duration_sec < 86400 then round(p_duration_sec, 1) end;
begin
  update public.app_guide_views v
  set duration_sec = coalesce(v_duration, v.duration_sec),
      watched_sec = greatest(
        v.watched_sec,
        least(round(greatest(coalesce(p_watched_sec, 0), 0), 1), coalesce(v_duration, v.duration_sec, 0))
      ),
      updated_at = now()
  where v.id = p_view_id
    and v.employee_id = public.current_employee_id()
    and v.opened_at > now() - interval '12 hours';
end;
$$;

revoke execute on function public.app_guide_view_start(uuid) from public, anon;
revoke execute on function public.app_guide_view_progress(uuid, numeric, numeric) from public, anon;
grant execute on function public.app_guide_view_start(uuid) to authenticated;
grant execute on function public.app_guide_view_progress(uuid, numeric, numeric) to authenticated;
