import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

type LogRow = {
  created_at: string;
  actor_name: string | null;
  action: string;
  detail: string | null;
};

function formatTs(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** 操作の種類に応じたバッジ配色 */
function actionClass(action: string) {
  if (action === "エラー") return "bg-red-50 text-red-700";
  if (action === "メール送信") return "bg-blue-50 text-blue-700";
  if (action === "ログイン") return "bg-green-50 text-green-700";
  if (action === "パスワード設定") return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">操作ログ</h1>
        <p className="mt-1 text-sm text-gray-500">
          ログイン・パスワード設定・メール送信・エラーなどの操作履歴です(新しい順・最新300件、90日で自動削除)。
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {logs.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">
            ログはまだありません。
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {logs.map((log, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${actionClass(
                      log.action
                    )}`}
                  >
                    {log.action}
                  </span>
                  <span className="text-xs tabular-nums text-gray-500">
                    {formatTs(log.created_at)}
                  </span>
                  <span className="text-xs text-gray-700">
                    {log.actor_name ?? "(不明)"}
                  </span>
                </div>
                {log.detail && (
                  <p className="mt-1 break-words text-sm text-gray-600">
                    {log.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
