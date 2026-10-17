import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { LogsView } from "./LogsView";

export default async function LogsPage() {
  await requireAdmin();
  const supabase = await createClient();

  // ログ本体は件数が多いため LogsView がブラウザから読む(サーバーで読むと Error 1102 になる)。
  // アカウントでの絞り込み用(ログの actor_name は記録した時点の名前なので、今の名前・在職状況はここから取る)
  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_no, name, nickname, status")
    .order("employee_no");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">操作ログ</h1>
        <p className="mt-1 text-sm text-gray-500">
          ログイン・パスワード設定・メール送信・エラーなどの操作履歴です(新しい順、90日で自動削除)。
        </p>
      </div>

      <LogsView employees={employees ?? []} />
    </div>
  );
}
