import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { PreviewView } from "./ui";

/** homepage_url が未設定のときに開く会社ホームページ(以前メニューに直接書いていた URL) */
const DEFAULT_HOMEPAGE_URL = "https://www.oominami.com";

/**
 * 管理メニュー「ホームページ」。2026-10-12 から、ホームページを直接開くのをやめてこの画面を出す(オーナー依頼)。
 * ホームページの URL・本日の営業(トップ用)の見え方と埋め込みコード・営業カレンダーの見え方と埋め込みコード、
 * 一番下に「ホームページを表示」ボタン。
 */
export default async function CalendarPreviewPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "homepage_url").maybeSingle();
  const site = getSiteUrl();
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PreviewView
        embedUrl={`${site}/calendar/embed`}
        todayEmbedUrl={`${site}/calendar/embed/today`}
        homepageUrl={data?.value ?? ""}
        defaultHomepageUrl={DEFAULT_HOMEPAGE_URL}
      />
    </div>
  );
}
