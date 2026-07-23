-- 標準休憩時間帯(3枠)を従業員セッションから読めるようにする。
-- app_settings は管理者のみ SELECT 可のため、休憩枠キーだけを返す関数を用意する
-- (QR打刻・勤務表保存で休憩を自動計算するために従業員セッションからも必要)。
-- （Supabase MCP で本番へ適用済み。このファイルは記録用。）
create or replace function public.get_break_settings()
returns table(key text, value text)
language sql security definer set search_path = public as $$
  select key, value from app_settings where key like 'break\_window\_%' escape '\';
$$;
revoke all on function public.get_break_settings() from public;
grant execute on function public.get_break_settings() to authenticated;
