import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { APP_GUIDE_COLUMNS, type AppGuide } from "@/lib/app-guides";
import { AppGuidesForm } from "./guides";

/**
 * アプリの解説（管理者）。管理者用・従業員用の全項目をグループ分けして表示し、登録・編集もここで行う。
 * 管理者は RLS 上すべての項目・動画を読めるので、従業員用の動画もここから再生できる。
 */
export default async function AdminGuidesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_guides")
    .select(APP_GUIDE_COLUMNS)
    .order("sort_order")
    .order("created_at");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <h1 className="text-xl font-bold">アプリの解説</h1>
      <AppGuidesForm guides={(data ?? []) as AppGuide[]} />
    </div>
  );
}
