import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { formatJstDateTime } from "@/lib/app-guides";
import { summarizeByPerson, type GuideViewRow } from "@/lib/guide-views";
import { zebraRowClass } from "@/lib/table";
import { WatchCell } from "./watch-cell";

/** 一度に出す履歴の行数(新しい順) */
const LIMIT = 500;

type ViewRow = {
  id: string;
  guide_id: string;
  employee_id: string;
  opened_at: string;
  watched_sec: number | string;
  duration_sec: number | string | null;
  employees: { name: string; nickname: string | null } | null;
};

/**
 * アプリの解説の視聴履歴(管理者。2026-10-14 オーナー依頼「誰が何の動画を見たか」)。
 * 再生画面を開くたびに1行(lib/guide-views.ts)。?guide=<id> でその解説だけにし、人ごとのまとめも出す。
 */
export default async function GuideViewsPage({ searchParams }: { searchParams: Promise<{ guide?: string }> }) {
  await requireAdmin();
  const { guide: guideParam } = await searchParams;
  const supabase = await createClient();

  const { data: guideData } = await supabase
    .from("app_guides")
    .select("id, title")
    .not("video_path", "is", null)
    .order("sort_order")
    .order("created_at");
  const guides = (guideData ?? []) as { id: string; title: string }[];
  const titles = Object.fromEntries(guides.map((g) => [g.id, g.title]));
  const current = guides.find((g) => g.id === guideParam) ?? null;

  let q = supabase
    .from("app_guide_views")
    .select("id, guide_id, employee_id, opened_at, watched_sec, duration_sec, employees(name, nickname)")
    .order("opened_at", { ascending: false })
    .limit(LIMIT);
  if (current) q = q.eq("guide_id", current.id);
  const { data, error } = await q;
  if (error) throw new Error(`視聴履歴の読み込みに失敗しました: ${error.message}`);

  const rows: GuideViewRow[] = ((data ?? []) as unknown as ViewRow[]).map((r) => ({
    id: r.id,
    guide_id: r.guide_id,
    person: r.employee_id,
    name: r.employees ? r.employees.nickname?.trim() || r.employees.name : "（削除された従業員）",
    opened_at: r.opened_at,
    watched_sec: Number(r.watched_sec),
    duration_sec: r.duration_sec == null ? null : Number(r.duration_sec),
  }));
  const people = current ? summarizeByPerson(rows) : [];

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? "border-blue-600 bg-blue-600 font-bold text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`;
  const th = "whitespace-nowrap px-3 py-2 font-semibold";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <Link href="/admin/guides" className="text-sm text-blue-700 hover:underline">
          ← アプリの解説
        </Link>
        <h1 className="mt-1 text-xl font-bold">視聴履歴</h1>
        <p className="mt-1 text-sm text-gray-500">
          誰がいつ、どの動画を開いて、どこまで再生したかの記録です（2026年10月14日から）。
          「再生」は実際に再生した長さで、先送りした分は含みません。動画の9割以上を再生したら「最後まで」と表示します。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/guides/views" className={chip(!current)}>
          すべて
        </Link>
        {guides.map((g) => (
          <Link key={g.id} href={`/admin/guides/views?guide=${g.id}`} className={chip(current?.id === g.id)}>
            {g.title}
          </Link>
        ))}
      </div>

      {current && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
            人ごと
            <span className="ml-2 text-xs font-normal text-gray-500">{people.length}人が開きました</span>
          </h2>
          {people.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">まだ誰も開いていません。</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-blue-50/70 text-left text-xs text-gray-600">
                  <tr>
                    <th className={th}>名前</th>
                    <th className={th}>いちばん長い再生</th>
                    <th className={`${th} text-right`}>回数</th>
                    <th className={th}>最後に開いた日時</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p, i) => (
                    <tr key={p.person} className={`${zebraRowClass(i)} border-t border-gray-100`}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{p.name}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <WatchCell watched={p.best_watched_sec} duration={p.duration_sec} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{p.count}回</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatJstDateTime(p.last_opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
          履歴
          <span className="ml-2 text-xs font-normal text-gray-500">新しい順{rows.length >= LIMIT ? `・最新の${LIMIT}件` : ""}</span>
        </h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">まだ記録がありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-blue-50/70 text-left text-xs text-gray-600">
                <tr>
                  <th className={th}>開いた日時</th>
                  <th className={th}>名前</th>
                  {!current && <th className={th}>解説</th>}
                  <th className={th}>再生</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={`${zebraRowClass(i)} border-t border-gray-100`}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatJstDateTime(r.opened_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{r.name}</td>
                    {!current && <td className="min-w-[10rem] px-3 py-2">{titles[r.guide_id] ?? "（削除された解説）"}</td>}
                    <td className="whitespace-nowrap px-3 py-2">
                      <WatchCell watched={r.watched_sec} duration={r.duration_sec} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
