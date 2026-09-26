import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_GUIDE_COLUMNS, GUIDE_VIDEO_BUCKET, type AppGuide } from "@/lib/app-guides";
import { WatchPlayer } from "./player";

export const metadata: Metadata = { title: "アプリの解説" };

/**
 * アプリの解説の動画を画面いっぱいで再生する（管理者・従業員共用。メニューの枠を出さない）。
 * 見られる項目は RLS（app_guides・Storage とも公開対象で絞る）で決まる。
 * 動画は非公開バケットの署名付きURL（4時間）。Supabase Storage は範囲リクエストに対応しているので、途中からの再生もできる。
 */
export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireEmployee(); // ログイン確認（管理者・従業員どちらも可）
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("app_guides").select(APP_GUIDE_COLUMNS).eq("id", id).maybeSingle();
  const guide = data as AppGuide | null;
  if (!guide) notFound();
  if (!guide.video_path) {
    if (guide.url) redirect(guide.url);
    notFound();
  }

  const { data: signed } = await supabase.storage.from(GUIDE_VIDEO_BUCKET).createSignedUrl(guide.video_path, 60 * 60 * 4);
  if (!signed?.signedUrl) notFound();

  return <WatchPlayer title={guide.title} summary={guide.summary} src={signed.signedUrl} />;
}
