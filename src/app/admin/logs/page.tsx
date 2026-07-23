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
  });
}

/** JST の日付部分("2026/07/15")。日替わりの区切り線判定に使う */
function jstDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * ログの重要度ランク(4段階)。カテゴリ(action文字列)ごとに1つのランクを割り当て、
 * ランクに応じたバッジ配色を適用する(個別カテゴリごとに色を決め打ちしない)。
 * - ルーチン(グレー): 必要に応じて参照する日常操作の情報
 * - イベント(ブルー): 不定期に発生する重要な作業
 * - 警告(オレンジ=amber): 管理者として注視すべき状況
 * - エラー(赤): システム例外・処理失敗など管理者対応/復旧が必要な状況
 */
type LogRank = "routine" | "event" | "warning" | "error";

const RANK_BY_ACTION: Record<string, LogRank> = {
  ログイン: "routine",
  打刻: "routine",
  ログ削除: "routine",
  パスワード設定: "event",
  メール送信: "event",
  削除: "event",
  打刻拒否: "warning",
  圏外打刻: "warning",
  エラー: "error",
};

const RANK_CLASS: Record<LogRank, string> = {
  routine: "bg-gray-100 text-gray-600",
  event: "bg-blue-50 text-blue-700",
  // 「オレンジ」は従来パスワード設定に使っていた amber-50/700 をそのまま踏襲
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
};

/** 操作の種類(action)に応じたバッジ配色。未知のカテゴリはルーチン扱い(グレー)にする */
function actionClass(action: string) {
  const rank = RANK_BY_ACTION[action] ?? "routine";
  return RANK_CLASS[rank];
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {logs.map((log, i) => {
                  // 新しい順。1つ前の行と日付が変わったら太い区切り線を引く
                  const dayChanged =
                    i > 0 &&
                    jstDate(log.created_at) !== jstDate(logs[i - 1].created_at);
                  return (
                    <tr
                      key={i}
                      className={
                        dayChanged
                          ? "border-t-2 border-gray-800"
                          : "border-t border-gray-100"
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-500">
                        {formatTs(log.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${actionClass(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">
                        {log.actor_name ?? "(不明)"}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {log.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
