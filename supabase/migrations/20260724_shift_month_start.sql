-- シフト予定表を「1日始まり(暦月)」で表示するかどうかの設定。
-- 既定は '0'(=給与期間と同じ26日始まり)。設定画面「シフト枠」で切り替える。
-- ※勤務表(給与計算)は従来どおり26日始まりのまま。この設定はシフト予定表のみに影響する。
insert into public.app_settings (key, value)
values ('shift_month_start', '0')
on conflict (key) do nothing;

-- 従業員のシフト閲覧画面でも1日始まりフラグを読めるよう、get_shift_settings の返却対象に加える。
create or replace function public.get_shift_settings()
returns table(key text, value text)
language sql security definer set search_path = public as $$
  select key, value from app_settings
  where key like 'shift_slot_%' or key = 'shift_month_start';
$$;
revoke all on function public.get_shift_settings() from public;
grant execute on function public.get_shift_settings() to authenticated;
