import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { AppGuideList } from "@/components/AppGuideList";
import { APP_GUIDE_COLUMNS, type AppGuide } from "@/lib/app-guides";

/** アプリの解説（従業員向け）。公開対象に「従業員」を含む項目だけ（RLS でも同じ条件で絞っている） */
export default async function GuidesPage() {
  await requireEmployee();
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_guides")
    .select(APP_GUIDE_COLUMNS)
    .eq("for_employee", true)
    .order("sort_order")
    .order("created_at");

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-lg font-bold">アプリの解説</h1>
      <p className="text-sm text-gray-500">操作説明の動画・資料です。タップすると別のタブで開きます。</p>
      <AppGuideList guides={(data ?? []) as AppGuide[]} />
    </div>
  );
}
