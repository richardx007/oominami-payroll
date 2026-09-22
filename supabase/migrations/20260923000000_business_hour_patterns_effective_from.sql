-- 営業時間の定義に「適用開始日」を追加
-- 2026-09-23: 10/1 から営業時間が変わるため、定義を日付で切り替えられるようにする。
--
-- 定義は (区分, 適用開始日) ごとに1行。ある日に使う定義は「その日以前で最も新しい適用開始日」の行。
-- 最初の定義は適用開始日 2000-01-01（＝「最初から」。画面では日付を出さない）で、削除できない。
-- ※TS側 src/lib/business-calendar-view.ts の generateMonthRows() / PATTERN_BASE_DATE が同じ規則を持つ。**片方だけ変えないこと。**

alter table public.business_hour_patterns
  add column if not exists effective_from date not null default '2000-01-01';

alter table public.business_hour_patterns drop constraint if exists business_hour_patterns_pkey;
alter table public.business_hour_patterns add primary key (day_type, effective_from);

comment on table public.business_hour_patterns is
  '営業カレンダーの営業時間の定義(区分×適用開始日)。その日以前で最も新しい effective_from の行を使う。2000-01-01 は最初の定義。overnight=true は翌日まで通し(お泊まり可)で close_min は使わない。';

-- 月の作成: 日ごとに、その日に有効な定義を当てはめる（それ以外は 20260917100000 と同じ）
create or replace function public.generate_business_month(p_ym date, p_regenerate boolean default false)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym date := date_trunc('month', p_ym)::date;
  v_end date := (date_trunc('month', p_ym) + interval '1 month - 1 day')::date;
  v_by uuid := null;
  v_count int;
begin
  if auth.uid() is not null then
    if not is_admin() then
      raise exception '管理者のみ実行できます';
    end if;
    v_by := current_employee_id();
  end if;

  if not p_regenerate and exists (select 1 from business_months where ym = v_ym) then
    raise exception '%年%月分は作成済みです', extract(year from v_ym), extract(month from v_ym);
  end if;

  if not exists (select 1 from jp_holidays
                 where date >= date_trunc('year', v_ym)
                   and date < date_trunc('year', v_ym) + interval '1 year')
     or not exists (select 1 from jp_holidays
                    where date >= date_trunc('year', v_end + 1)
                      and date < date_trunc('year', v_end + 1) + interval '1 year') then
    raise exception '祝日データを取得できていません（%年%月分の作成を中止しました）',
      extract(year from v_ym), extract(month from v_ym);
  end if;

  with src as (
    select d::date as date, business_day_type(d::date) as day_type
    from generate_series(v_ym, v_end, interval '1 day') d
  )
  insert into business_days
    (date, day_type, holiday_name, status, open_min, close_min, overnight, is_manual, updated_at, updated_by)
  select s.date, s.day_type, h.name,
         case when p.is_open then 'open' else 'closed' end,
         case when p.is_open then p.open_min end,
         case when p.is_open and not p.overnight then p.close_min end,
         p.is_open and p.overnight,
         false, now(), v_by
  from src s
  join lateral (
    select * from business_hour_patterns bp
    where bp.day_type = s.day_type and bp.effective_from <= s.date
    order by bp.effective_from desc
    limit 1
  ) p on true
  left join jp_holidays h on h.date = s.date
  on conflict (date) do update set
    holiday_name = excluded.holiday_name,
    day_type   = case when business_days.is_manual then business_days.day_type  else excluded.day_type  end,
    status     = case when business_days.is_manual then business_days.status    else excluded.status    end,
    open_min   = case when business_days.is_manual then business_days.open_min  else excluded.open_min  end,
    close_min  = case when business_days.is_manual then business_days.close_min else excluded.close_min end,
    overnight  = case when business_days.is_manual then business_days.overnight else excluded.overnight end,
    updated_at = case when business_days.is_manual then business_days.updated_at else excluded.updated_at end,
    updated_by = case when business_days.is_manual then business_days.updated_by else excluded.updated_by end;
  get diagnostics v_count = row_count;

  insert into business_months (ym, generated_at, generated_by)
  values (v_ym, now(), v_by)
  on conflict (ym) do update set generated_at = excluded.generated_at, generated_by = excluded.generated_by;

  if v_by is not null then
    perform log_activity(
      case when p_regenerate then '営業カレンダー作り直し' else '営業カレンダー作成' end,
      format('%s年%s月分', extract(year from v_ym), extract(month from v_ym))
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.generate_business_month(date, boolean) from public, anon;
grant execute on function public.generate_business_month(date, boolean) to authenticated;
