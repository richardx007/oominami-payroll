"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { zebraRowClass } from "@/lib/table";
import { formatJstDate, formatJstDateWeekday, formatJstTime, jstYmd } from "@/lib/jst-format";
import { isDummyStatus, isWorkingStatus } from "@/lib/employee-status";

type LogRow = {
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  detail: string | null;
  /** 実行環境(アプリ / ブラウザ / GitHub / Supabase / Cloudflare / Claude)。不明は null */
  source: string | null;
};

/** JSTの暦日でのUTC正午タイムスタンプ(日数差の計算専用。時刻は無視する) */
function jstCalendarDayMs(iso: string) {
  const [y, m, d] = jstYmd(iso).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** JST暦日で「今日」から何日前か(0=今日) */
function jstDaysAgo(iso: string) {
  const today = jstCalendarDayMs(new Date().toISOString());
  return Math.round((today - jstCalendarDayMs(iso)) / 86400000);
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
  シフト: "routine",
  パスワード設定: "event",
  初回ログイン: "event",
  メール送信: "event",
  削除: "event",
  権限変更: "event",
  端末: "event",
  締め処理: "event",
  締め解除: "event",
  支払済み: "event",
  勤務修正: "event",
  バックアップ: "routine",
  バックアップ警告: "warning",
  打刻拒否: "warning",
  打刻失敗: "warning",
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

const UNKNOWN_ACTOR = "(不明)";

/**
 * 実行環境の表示。記録が無い(2026-10-28 より前など)ものは、自動処理の実行者の名前から補う。
 * それでも分からないものはブランク
 */
const SOURCE_BY_ACTOR: Record<string, string> = {
  "システム(自動)": "Supabase",
  自動バックアップ: "GitHub",
};
function sourceOf(l: LogRow): string {
  return l.source ?? SOURCE_BY_ACTOR[l.actor_name ?? ""] ?? "";
}

type EmployeeRef = {
  id: string;
  employee_no: string;
  name: string;
  nickname: string | null;
  status: string;
};

/**
 * 絞り込みのキー。従業員の操作は actor_id(従業員ID)でまとめる(ニックネームを変えると記録時の
 * actor_name が変わるため)。従業員でない記録(自動バックアップ・システム・未ログイン)や、
 * 削除済みの従業員は actor_name でまとめる。
 */
function actorKey(l: LogRow, employeeIds: Set<string>) {
  return l.actor_id && employeeIds.has(l.actor_id)
    ? `e:${l.actor_id}`
    : `n:${l.actor_name ?? UNKNOWN_ACTOR}`;
}

/**
 * 絞り込みの選択肢。従業員はニックネーム(未設定なら氏名)で、在職者(従業員No順)→
 * 従業員でない記録(名前順)→ 退職者(従業員No順)の順に並べる。ログに出てくる人だけ。
 */
function actorOptions(logs: LogRow[], employees: EmployeeRef[]) {
  const employeeIds = new Set(employees.map((e) => e.id));
  const used = new Set(logs.map((l) => actorKey(l, employeeIds)));
  const label = (e: EmployeeRef) => e.nickname?.trim() || e.name;
  const active = employees
    .filter((e) => isWorkingStatus(e.status) && used.has(`e:${e.id}`))
    .map((e) => ({ key: `e:${e.id}`, label: isDummyStatus(e.status) ? `${label(e)}(ダミー)` : label(e) }));
  const retired = employees
    .filter((e) => !isWorkingStatus(e.status) && used.has(`e:${e.id}`))
    .map((e) => ({ key: `e:${e.id}`, label: `${label(e)}(退職)` }));
  const others = Array.from(used)
    .filter((k) => k.startsWith("n:"))
    .map((k) => ({ key: k, label: k.slice(2) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));
  return [...active, ...others, ...retired];
}

/**
 * 操作ログ(90日分の全件)をブラウザから直接読む(RLS で管理者だけが読める)。
 * サーバーで読み込んで画面に埋め込むと、件数の多さで Worker の CPU 時間が上限(無料プラン 10ms)を
 * 大きく超えて Error 1102 になる(2026-10-18: 1,466件で 440〜630ms)ため。
 * Supabase は1回の取得が最大1000行なので、1000行ずつ分けて全件を取る。
 */
async function fetchAllLogs(): Promise<LogRow[]> {
  const supabase = createClient();
  const PAGE = 1000;
  const logs: LogRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("created_at, actor_id, actor_name, action, detail, source")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as LogRow[];
    logs.push(...rows);
    if (rows.length < PAGE) return logs;
  }
}

const NO_LOGS: LogRow[] = [];

export function LogsView({ employees }: { employees: EmployeeRef[] }) {
  const [loaded, setLoaded] = useState<LogRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchAllLogs().then(
      (rows) => {
        if (!cancelled) setLoaded(rows);
      },
      (e) => {
        console.error("[logs]", e);
        if (!cancelled) setLoadError(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const logs = loaded ?? NO_LOGS;

  const employeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const categories = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [logs]);

  const actors = useMemo(() => actorOptions(logs, employees), [logs, employees]);

  const [category, setCategory] = useState<string>("all");
  const [actor, setActor] = useState<string>("all");
  // 既定で「8日以前」(今日を含め9日目以降)の日は閉じた状態にする。
  // 手動でトグルした日だけを覚えておき、既定の開閉を反転して扱う。
  const [toggledDays, setToggledDays] = useState<Set<string>>(() => new Set());
  // 詳細を全文表示している行(PC では長い詳細を1行に切り詰めて出し、タップで全文にする)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(
    () =>
      logs.filter(
        (l) =>
          (category === "all" || l.action === category) &&
          (actor === "all" || actorKey(l, employeeIds) === actor)
      ),
    [logs, category, actor, employeeIds]
  );

  const days = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const log of filtered) {
      const key = formatJstDate(log.created_at);
      const arr = map.get(key);
      if (arr) arr.push(log);
      else map.set(key, [log]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggleDay(key: string) {
    setToggledDays((prev) => {
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
        <label className="ml-2 text-sm text-gray-500" htmlFor="log-actor">
          アカウント:
        </label>
        <select
          id="log-actor"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">すべて</option>
          {actors.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loadError ? (
          <p className="px-4 py-10 text-center text-sm text-red-600">
            ログを読み込めませんでした。画面を読み込み直してください。
          </p>
        ) : loaded === null ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">読み込み中…</p>
        ) : days.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">
            該当するログはありません。
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {days.map(([day, dayLogs]) => {
              const collapsed = (jstDaysAgo(dayLogs[0].created_at) >= 8) !== toggledDays.has(day);
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
                      {formatJstDateWeekday(dayLogs[0].created_at)}
                    </span>
                    <span className="text-xs font-normal text-gray-500">
                      {dayLogs.length}件
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="text-sm">
                        <tbody>
                          {dayLogs.map((log, i) => {
                            const rowKey = `${day}-${i}`;
                            const open = expanded.has(rowKey);
                            return (
                              <tr
                                key={i}
                                className={`border-t border-gray-100 ${zebraRowClass(i)}`}
                              >
                                {/* 日付は見出しでまとめているので時刻だけ。横スクロールしても固定する
                                    (固定列は bg-inherit で行の縞の色を引き継ぐ。lib/table.ts 参照) */}
                                <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-3 py-2.5 tabular-nums text-gray-500 shadow-[2px_0_2px_-1px_rgba(0,0,0,0.12)]">
                                  {formatJstTime(log.created_at)}
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
                                  {log.actor_name ?? UNKNOWN_ACTOR}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2.5 text-xs text-gray-400">
                                  {sourceOf(log)}
                                </td>
                                {/* PC は長い詳細を画面内で切り詰め、タップで全文(折り返し)にする。
                                    スマホは従来どおり横スクロールで読む */}
                                <td
                                  onClick={() => log.detail && toggleExpanded(rowKey)}
                                  title={open ? undefined : (log.detail ?? undefined)}
                                  className={`px-3 py-2.5 text-gray-600 ${log.detail ? "cursor-pointer" : ""}`}
                                >
                                  {/* 表のセルは max-width が効かないので、中の div で切り詰める */}
                                  <div
                                    className={
                                      open
                                        ? "max-w-[85vw] whitespace-pre-wrap break-all md:max-w-[36rem]"
                                        : "whitespace-nowrap md:max-w-[36rem] md:truncate"
                                    }
                                  >
                                    {log.detail}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
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
