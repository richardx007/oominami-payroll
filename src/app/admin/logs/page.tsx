import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { LogsView } from "./LogsView";

type LogRow = {
  created_at: string;
  actor_name: string | null;
  action: string;
  detail: string | null;
};

export default async function LogsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("activity_logs")
    .select("created_at, actor_name, action, detail")
    .order("created_at", { ascending: false })
    .limit(300);

  const logs = (data ?? []) as LogRow[];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">操作ログ</h1>
        <p className="mt-1 text-sm text-gray-500">
          ログイン・パスワード設定・メール送信・エラーなどの操作履歴です(新しい順・最新300件、90日で自動削除)。
        </p>
      </div>

      <LogsView logs={logs} />
    </div>
  );
}
