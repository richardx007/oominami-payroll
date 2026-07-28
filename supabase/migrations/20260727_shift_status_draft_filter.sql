-- 調整中の月は、従業員には自分の予実状態だけを返す(shift_assignments の SELECT ポリシーと同条件)。
create or replace function public.get_shift_status(p_start date, p_end date)
returns table(employee_id uuid, work_date date, status text)
language plpgsql security definer set search_path to 'public'
as $function$
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
    end
  from plan p
  full outer join act a on p.eid = a.eid and p.wd = a.wd
  where is_admin()
     or coalesce(p.eid, a.eid) = current_employee_id()
     or not is_shift_draft(coalesce(p.wd, a.wd));
end;
$function$;
