-- 勤務ルール文書(jpg/png/pdf)を保管する非公開バケット。
-- RLSでログイン済み(authenticated)なら閲覧可、管理者のみアップロード/更新/削除可にする。
-- （Supabase MCP で本番へ適用済み。このファイルは記録用。）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-rules', 'work-rules', false, 20971520,
  array['image/jpeg','image/png','application/pdf']
)
on conflict (id) do nothing;

create policy "work_rules_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'work-rules');

create policy "work_rules_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'work-rules' and public.is_admin());

create policy "work_rules_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'work-rules' and public.is_admin())
with check (bucket_id = 'work-rules' and public.is_admin());

create policy "work_rules_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'work-rules' and public.is_admin());
