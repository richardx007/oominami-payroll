-- 勤務ルール文書のメタ情報(ストレージパス・元ファイル名・MIME種別)を
-- 従業員セッションから読めるようにする(app_settings は管理者のみ SELECT 可のため)。
-- （Supabase MCP で本番へ適用済み。このファイルは記録用。）
create or replace function public.get_work_rules_meta()
returns table(key text, value text)
language sql security definer set search_path = public as $$
  select key, value from app_settings where key like 'work\_rules\_%' escape '\';
$$;
revoke all on function public.get_work_rules_meta() from public;
grant execute on function public.get_work_rules_meta() to authenticated;
