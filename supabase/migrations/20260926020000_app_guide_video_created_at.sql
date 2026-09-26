-- アプリの解説: 動画ファイルの作成日時を記録する（2026-09-26・オーナー依頼）
-- 設定画面の一覧の2行目に表示する。動画を選んだときにファイルの最終更新日時を自動で入れ、手で直せる
-- （ブラウザからはファイルの作成日時そのものは取れないため）。URL の項目では使わない。

alter table public.app_guides add column if not exists video_created_at timestamptz;

comment on column public.app_guides.video_created_at is '動画ファイルの作成日時（設定画面で登録。既定はファイルの最終更新日時）';
