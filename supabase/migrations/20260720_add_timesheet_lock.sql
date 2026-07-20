-- 従業員による出退勤時刻・休憩時間の編集ロック機能
-- 管理者が設定画面でON/OFF切替できる。ONの場合、従業員は勤務表画面から
-- 出勤/退勤時刻・休憩時間を編集できない(交通費・メモは引き続き編集可)。
-- QR打刻(出勤/退勤)自体はロックの影響を受けず、従来通り利用できる。

insert into public.app_settings (key, value) values ('lock_employee_time_edit', 'false')
on conflict (key) do nothing;

-- app_settings は管理者のみ SELECT 可のため、従業員セッションからロック状態を読むための関数
create or replace function public.get_timesheet_lock()
returns boolean
language sql security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'lock_employee_time_edit'), 'false') = 'true';
$$;
revoke all on function public.get_timesheet_lock() from public;
grant execute on function public.get_timesheet_lock() to authenticated;
