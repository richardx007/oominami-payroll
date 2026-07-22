-- 会社名・送信元メールアドレスを従業員セッションから読めるようにする。
-- app_settings は管理者のみ SELECT 可のため、従業員側の「管理者へメール」機能で
-- 宛先(gmail_user)と本文(company_name)を組み立てるために限定して返す。
-- （Supabase MCP で本番へ適用済み。このファイルは記録用。）
create or replace function public.get_contact_settings()
returns table(key text, value text)
language sql security definer set search_path = public as $$
  select key, value from app_settings where key in ('company_name', 'gmail_user');
$$;
revoke all on function public.get_contact_settings() from public;
grant execute on function public.get_contact_settings() to authenticated;
