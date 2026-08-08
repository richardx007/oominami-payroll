"use client";

import { useMemo, useState } from "react";

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

/** JST の日付部分("2026/07/15")。日単位グループ化に使う */
function jstDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function jstDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
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
  初回ログイン: "event",
  メール送信: "event",
  削除: "event",
  バックアップ: "routine",
  バックアップ警告: "warning",
  打刻拒否: "warning",
  圏外打刻: "warning",
  エラー: "error",
};

const RANK_CLASS: Record<LogRank, string> = {
  routine: "bg-gray-100 text-gray-600",
  // 「オレンジ」は従来パスワード設定に使っていた amber-50/700 をそのまま踏襲
  event: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
};

/** 操作の種類(action)に応じたバッジ配色。未知のカテゴリはルーチン扱い(グレー)にする */
function actionClass(action: string) {
  const rank = RANK_BY_ACTION[action] ?? "routine";
  return RANK_CLASS[rank];
}

export function LogsView({ logs }: { logs: LogRow[] }) {
  const categories = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [logs]);

  const [category, setCategory] = useState<string>("all");
  // 未操作(null)の日は既定で開く。一度でも触った日だけ Set に入れて管理する
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => (category === "all" ? logs : logs.filter((l) => l.action === category)),
    [logs, category]
  );

  const days = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const log of filtered) {
      const key = jstDate(log.created_at);
      const arr = map.get(key);
      if (arr) arr.push(log);
      else map.set(key, [log]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggleDay(key: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-500" htmlFor="log-category">
          カテゴリ:
        </label>
        <select
          id="log-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">すべて</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {days.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">
            該当するログはありません。
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {days.map(([day, dayLogs]) => {
              const collapsed = collapsedDays.has(day);
              return (
                <div key={day}>
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className="flex w-full items-center justify-between gap-2 bg-gray-200 px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-gray-300"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block transition-transform ${collapsed ? "-rotate-90" : ""}`}
                      >
                        ▼
                      </span>
                      {jstDateLabel(dayLogs[0].created_at)}
                    </span>
                    <span className="text-xs font-normal text-gray-500">
                      {dayLogs.length}件
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {dayLogs.map((log, i) => (
                            <tr key={i} className="border-t border-gray-100">
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
