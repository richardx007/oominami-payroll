/**
 * アプリの解説: 動画の視聴履歴(2026-10-14 オーナー依頼「誰が何の動画を見たか」)。
 * 再生画面を開くたびに1行記録し、再生中は「実際に再生した秒数」を10秒ごとに送る(テーブル app_guide_views)。
 * 一覧は管理者の「アプリの解説 › 視聴履歴」(/admin/guides/views)。
 */

/** 再生画面を開いたときに呼ぶ DB 関数(行の ID を返す) */
export const VIEW_START_RPC = "app_guide_view_start";
/** 再生中に呼ぶ DB 関数(再生した秒数の合計と動画の長さ) */
export const VIEW_PROGRESS_RPC = "app_guide_view_progress";
/** 再生した秒数を送る間隔(ミリ秒)。画面を閉じたときは、この間の分が記録されないことがある */
export const VIEW_SEND_INTERVAL_MS = 10_000;
/** この割合以上を再生したら「最後まで」と表示する */
export const VIEW_DONE_RATIO = 0.9;

/**
 * 前回の再生位置から今の位置までのうち、「再生した」とみなす秒数。
 * timeupdate は再生中おおよそ 0.25 秒ごとに来るので、1.5 秒を超える飛び(先送り・巻き戻し)や逆戻りは数えない。
 */
export function playedDelta(last: number | null, now: number): number {
  if (last == null || !Number.isFinite(now)) return 0;
  const d = now - last;
  return d > 0 && d < 1.5 ? d : 0;
}

/** 秒 → "3:43" */
export function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 再生した割合(0〜100 の整数)。動画の長さが分からなければ null */
export function watchedPercent(watched: number, duration: number | null): number | null {
  if (!duration || duration <= 0) return null;
  return Math.min(100, Math.round((watched / duration) * 100));
}

/** 「最後まで」見たか(動画の長さの 90% 以上を再生) */
export function watchedToEnd(watched: number, duration: number | null): boolean {
  return !!duration && duration > 0 && watched >= duration * VIEW_DONE_RATIO;
}

/** 視聴履歴の1行(画面表示用。名前は各アプリで引いて入れる) */
export type GuideViewRow = {
  id: string;
  guide_id: string;
  /** 人を区別するキー(従業員 ID・ログインアカウント ID) */
  person: string;
  name: string;
  opened_at: string;
  watched_sec: number;
  duration_sec: number | null;
};

/** 人ごとのまとめ(開いた回数・最後に開いた日時・いちばん長く再生した回)。最後に開いた順 */
export type GuideViewPerson = {
  person: string;
  name: string;
  count: number;
  last_opened_at: string;
  best_watched_sec: number;
  duration_sec: number | null;
};

export function summarizeByPerson(rows: GuideViewRow[]): GuideViewPerson[] {
  const map = new Map<string, GuideViewPerson>();
  for (const r of rows) {
    const p = map.get(r.person);
    if (!p) {
      map.set(r.person, {
        person: r.person,
        name: r.name,
        count: 1,
        last_opened_at: r.opened_at,
        best_watched_sec: r.watched_sec,
        duration_sec: r.duration_sec,
      });
      continue;
    }
    p.count += 1;
    if (r.opened_at > p.last_opened_at) p.last_opened_at = r.opened_at;
    if (r.watched_sec > p.best_watched_sec) p.best_watched_sec = r.watched_sec;
    p.duration_sec ??= r.duration_sec;
  }
  return [...map.values()].sort((a, b) => (a.last_opened_at < b.last_opened_at ? 1 : -1));
}

/** 解説ごとの見た人数(同じ人が何回開いても1人) */
export function countPeopleByGuide(rows: { guide_id: string; person: string }[]): Record<string, number> {
  const sets: Record<string, Set<string>> = {};
  for (const r of rows) (sets[r.guide_id] ??= new Set()).add(r.person);
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size]));
}
