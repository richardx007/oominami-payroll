import { formatSec, watchedPercent, watchedToEnd } from "@/lib/guide-views";

/** 再生した長さの表示:「✓ 最後まで」/「1:23 / 3:43（37%）」/ 再生していなければ「開いただけ」 */
export function WatchCell({ watched, duration }: { watched: number; duration: number | null }) {
  if (watchedToEnd(watched, duration)) {
    return <span className="font-bold text-green-700">✓ 最後まで</span>;
  }
  if (watched < 1) return <span className="text-gray-400">開いただけ</span>;
  const pct = watchedPercent(watched, duration);
  return (
    <span>
      {formatSec(watched)}
      {duration ? ` / ${formatSec(duration)}` : ""}
      {pct != null && <span className="ml-1 text-gray-500">（{pct}%）</span>}
    </span>
  );
}
