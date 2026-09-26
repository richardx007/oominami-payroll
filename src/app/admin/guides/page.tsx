import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { AppGuideList } from "@/components/AppGuideList";
import { APP_GUIDE_COLUMNS, type AppGuide } from "@/lib/app-guides";

/** アプリの解説（管理者向け）。公開対象に「管理者」を含む項目を表示する */
export default async function AdminGuidesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_guides")
    .select(APP_GUIDE_COLUMNS)
    .eq("for_admin", true)
    .order("sort_order")
    .order("created_at");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">アプリの解説</h1>
        <p className="mt-1 text-sm text-gray-500">
          操作説明の動画・資料です。タップすると別のタブで開きます。
          追加・変更は<Link href="/admin/settings#app-guides" className="text-blue-700 underline">設定の「アプリの解説」</Link>で行います。
        </p>
      </div>
      <AppGuideList guides={(data ?? []) as AppGuide[]} showAudience />
    </div>
  );
}
