"use client";

import { useState } from "react";
import Link from "next/link";

// 旧 oominami-calendar の埋め込みコードと同じ形（src だけ差し替える）
function embedCode(url: string) {
  return `<iframe
  src="${url}"
  title="営業カレンダー"
  loading="lazy"
  style="width:100%; border:0; min-height:760px; background:transparent;"
></iframe>`;
}

const WIDTHS = [
  { key: "pc", label: "パソコン", width: "100%" },
  { key: "sp", label: "スマホ", width: "390px" },
] as const;

export function PreviewView({ embedUrl }: { embedUrl: string }) {
  const [width, setWidth] = useState<(typeof WIDTHS)[number]["key"]>("pc");
  const [withDraft, setWithDraft] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const code = embedCode(embedUrl);
  const w = WIDTHS.find((x) => x.key === width)!;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const toggle = (active: boolean) =>
    `px-3 py-1.5 text-sm font-semibold ${active ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/calendar" className="text-sm text-blue-700 hover:underline">
          ← 営業カレンダー
        </Link>
        <h1 className="mt-1 text-xl font-bold">ホームページでの見え方</h1>
        <p className="mt-1 text-sm text-gray-500">
          ホームページに埋め込むページをそのまま表示しています。日をタップすると、ホームページと同じ詳細が出ます。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-gray-300">
          {WIDTHS.map((x) => (
            <button key={x.key} onClick={() => setWidth(x.key)} className={toggle(width === x.key)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-gray-300">
          <button onClick={() => setWithDraft(false)} className={toggle(!withDraft)}>
            公開中の月だけ
          </button>
          <button onClick={() => setWithDraft(true)} className={toggle(withDraft)}>
            準備中の月も
          </button>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          再読み込み
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {withDraft
          ? "準備中の月（翌々月）まで進めます。実際のホームページでは今月と翌月だけが表示されます。"
          : "実際のホームページと同じく、今月と翌月だけが表示されます。"}
      </p>

      {/* ホームページ上の枠を想定した背景 */}
      <div className="overflow-x-auto rounded-xl border border-dashed border-gray-300 bg-white p-2 sm:p-4">
        <div className="mx-auto" style={{ width: w.width, maxWidth: "100%" }}>
          <iframe
            key={`${reloadKey}-${withDraft}`}
            src={withDraft ? "/calendar/embed?preview=1" : "/calendar/embed"}
            title="営業カレンダー（プレビュー）"
            style={{ width: "100%", border: 0, minHeight: 760, background: "transparent" }}
          />
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">ホームページ埋め込み用コード</h2>
        <p className="mt-1 text-sm text-gray-500">
          現在のホームページのコードと同じ形です。差し替えるときは <code className="rounded bg-gray-100 px-1">src=&quot;…&quot;</code> の部分だけが変わります。
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">{code}</pre>
        <button
          onClick={copy}
          className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {copied ? "コピーしました" : "コードをコピー"}
        </button>
      </section>
    </div>
  );
}
