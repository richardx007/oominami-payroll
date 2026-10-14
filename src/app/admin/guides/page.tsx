import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { countPeopleByGuide } from "@/lib/guide-views";
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

  // 解説ごとの見た人数(一覧の各行に出す。行数が増えたら集計を DB 側に移す)
  const { data: views } = await supabase.from("app_guide_views").select("guide_id, employee_id").limit(10000);
  const viewCounts = countPeopleByGuide(
    ((views ?? []) as { guide_id: string; employee_id: string }[]).map((v) => ({ guide_id: v.guide_id, person: v.employee_id })),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-end justify-between gap-2">
        <h1 className="text-xl font-bold">アプリの解説</h1>
        <Link href="/admin/guides/views" className="text-sm font-medium text-blue-700 hover:underline">
          視聴履歴 →
        </Link>
      </div>
      <AppGuidesForm guides={(data ?? []) as AppGuide[]} viewCounts={viewCounts} />
    </div>
  );
}
