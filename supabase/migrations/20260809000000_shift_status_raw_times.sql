-- get_shift_status() に予定/実績の生時刻(HH:MM)を追加で返すよう拡張。
-- 目的: シフト予定表で「本日」の名前の色/太字を、予定と実績の突合カテゴリ(status)だけでなく
-- 出勤済み・退勤未了かどうかまで見て動的に変える(遅刻の赤字強調など)ため、クライアント側で
-- 生の予定・実績時刻が必要になった。
--
-- ⚠️ 戻り値の型(OUT列)が変わるため `create or replace` ではなく DROP→CREATE が必要
--    (2026-08-09に本番適用時、42P13 "cannot change return type of existing function" で判明)。

drop function public.get_shift_status(date, date);

create function public.get_shift_status(p_start date, p_end date)
returns table(
  employee_id uuid,
  work_date date,
  status text,
  planned_start text,
  planned_end text,
  actual_start text,
  actual_end text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a_s text; a_e text; b_s text; b_e text; c_s text; c_e text;
begin
  select value into a_s from app_settings where key = 'shift_slot_a_start';
  select value into a_e from app_settings where key = 'shift_slot_a_end';
  select value into b_s from app_settings where key = 'shift_slot_b_start';
  select value into b_e from app_settings where key = 'shift_slot_b_end';
  select value into c_s from app_settings where key = 'shift_slot_c_start';
  select value into c_e from app_settings where key = 'shift_slot_c_end';

  return query
  with slots(k, s, e) as (
    values ('A', norm_hhmm(a_s), norm_hhmm(a_e)),
           ('B', norm_hhmm(b_s), norm_hhmm(b_e)),
           ('C', norm_hhmm(c_s), norm_hhmm(c_e))
  ),
  plan as (
    select sa.employee_id eid, sa.work_date wd,
      coalesce(norm_hhmm(sa.custom_start), sl.s) ps,
      coalesce(norm_hhmm(sa.custom_end), sl.e) pe
    from shift_assignments sa
    join slots sl on sl.k = sa.slot
    where sa.work_date between p_start and p_end
  ),
  act as (
    select we.employee_id eid, we.work_date wd,
      to_char(we.start_time, 'HH24:MI') as_s,
      case when we.end_time is null then null else to_char(we.end_time, 'HH24:MI') end as_e
    from work_entries we
    where we.work_date between p_start and p_end
  )
  select
    coalesce(p.eid, a.eid),
    coalesce(p.wd, a.wd),
    case
      when p.eid is null then 'unplanned'
      when a.eid is null then 'missing'
      when p.ps = a.as_s and coalesce(p.pe, '') = coalesce(a.as_e, '') then 'match'
      else 'timediff'
    end,
    p.ps,
    p.pe,
    a.as_s,
    a.as_e
  from plan p
  full outer join act a on p.eid = a.eid and p.wd = a.wd;
end;
$$;

revoke all on function public.get_shift_status(date, date) from public;
grant execute on function public.get_shift_status(date, date) to authenticated;
grant execute on function public.get_shift_status(date, date) to service_role;
