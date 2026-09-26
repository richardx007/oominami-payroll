-- アプリの解説: 動画をアプリに保存して、アプリ内のプレイヤーで再生できるようにする
-- 2026-09-26: Google ドライブの動画はスマホ（特にホーム画面に追加したアプリ）で小さくしか表示できず、
-- ログインしていない状態では「この動画を再生できませんでした」になることがあるため。
--
-- 各項目は「URL（外部の資料・動画へのリンク）」か「動画（非公開バケット app-guides に保存）」のどちらか。
-- 動画はブラウザから直接 Storage にアップロードする（Workers を通すと CPU 時間・リクエストサイズの上限に当たるため）。
-- 閲覧は署名付きURL（サーバーで発行）。Storage の SELECT も app_guides と同じ公開対象で絞る。

alter table public.app_guides alter column url drop not null;
alter table public.app_guides drop constraint if exists app_guides_url_check;
alter table public.app_guides add constraint app_guides_url_check
  check (url is null or (url ~ '^https?://' and length(url) <= 1000));

alter table public.app_guides add column if not exists video_path text;
alter table public.app_guides add column if not exists video_size bigint;

alter table public.app_guides drop constraint if exists app_guides_link_check;
alter table public.app_guides add constraint app_guides_link_check
  check (url is not null or video_path is not null);

comment on column public.app_guides.video_path is 'Storage バケット app-guides 内のパス（動画をアプリに保存した場合）。url とどちらか一方';
comment on column public.app_guides.video_size is '動画のバイト数（設定画面で容量の目安を出すため）';

-- 非公開バケット（1ファイル50MBまで・mp4/mov）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-guides', 'app-guides', false, 52428800, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 閲覧: 管理者は全部、従業員は「従業員」向けの解説の動画だけ
drop policy if exists app_guides_video_select on storage.objects;
create policy app_guides_video_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'app-guides'
    and (
      public.is_admin()
      or exists (select 1 from public.app_guides g where g.video_path = storage.objects.name and g.for_employee)
    )
  );

drop policy if exists app_guides_video_admin_insert on storage.objects;
create policy app_guides_video_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'app-guides' and public.is_admin());

drop policy if exists app_guides_video_admin_update on storage.objects;
create policy app_guides_video_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'app-guides' and public.is_admin())
  with check (bucket_id = 'app-guides' and public.is_admin());

drop policy if exists app_guides_video_admin_delete on storage.objects;
create policy app_guides_video_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'app-guides' and public.is_admin());
