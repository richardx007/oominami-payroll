import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { LogsView } from "./LogsView";

type LogRow = {
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  detail: string | null;
};

export default async function LogsPage() {
  await requireAdmin();
  const supabase = await createClient();

  // 件数の上限は設けない(90日で自動削除されるため)。Supabase は1回の取得が最大1000行なので、
  // 1000行ずつ分けて全件を取る。
  const PAGE = 1000;
  const logs: LogRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("activity_logs")
      .select("created_at, actor_id, actor_name, action, detail")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as LogRow[];
    logs.push(...rows);
    if (rows.length < PAGE) break;
  }

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

      <LogsView logs={logs} employees={employees ?? []} />
    </div>
  );
}
