-- アプリの解説: アップロードした動画のファイル名を記録する（2026-09-28・オーナー依頼）
-- 設定画面の一覧の2行目に、作成日時と並べて表示する（どの書き出しを登録したかを見分けるため）。
-- Storage のパスはランダムID（日本語のファイル名はキーとして扱いにくい）なので、元の名前はここに残す。
-- 追加前に登録した動画は null（画面では「未記録」。動画を差し替えると記録される）。URL の項目では使わない。

alter table public.app_guides add column if not exists video_file_name text;

alter table public.app_guides drop constraint if exists app_guides_video_file_name_check;
alter table public.app_guides add constraint app_guides_video_file_name_check
  check (video_file_name is null or length(video_file_name) <= 255);

comment on column public.app_guides.video_file_name is 'アップロードした動画の元のファイル名（設定画面で表示。Storage のパスはランダムID）';
