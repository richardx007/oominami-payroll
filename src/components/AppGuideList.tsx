import Link from "next/link";
import { linkKind, type AppGuide } from "@/lib/app-guides";

const KIND_LABEL = { drive: "Google ドライブで開く", youtube: "YouTube で開く", web: "開く" } as const;

/** アプリの解説の一覧（/admin/guides・/guides で共用）。
 * アプリに保存した動画は同じタブの再生画面（/watch/[id]）、URL は別タブで開く */
export function AppGuideList({ guides }: { guides: AppGuide[] }) {
  if (guides.length === 0) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
        解説はまだありません
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {guides.map((g) => {
        const body = (
          <>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
              <PlayIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-gray-900">{g.title}</span>
              {g.summary && <span className="mt-1 block whitespace-pre-line text-sm text-gray-600">{g.summary}</span>}
              {/* URL の項目だけ、別タブで開くことが分かるように開き先を添える（動画はアプリ内の再生画面） */}
              {!g.video_path && (
                <span className="mt-2 block text-xs font-semibold text-blue-700">{KIND_LABEL[linkKind(g.url ?? "")]} ↗</span>
              )}
            </span>
          </>
        );
        const cls =
          "flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-sm active:opacity-80";
        return (
          <li key={g.id}>
            {g.video_path ? (
              <Link href={`/watch/${g.id}`} className={cls}>
                {body}
              </Link>
            ) : (
              <a href={g.url ?? "#"} target="_blank" rel="noopener noreferrer" className={cls}>
                {body}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}
