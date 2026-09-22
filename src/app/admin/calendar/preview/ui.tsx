"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EMBED_HEIGHT_MESSAGE, isEmbedHeightMessage } from "@/lib/embed-height";

// 旧 oominami-calendar の埋め込みコードに、高さを合わせるスクリプトを足した形。
// カレンダーの中身が iframe より高いとHP側に内側のスクロールバーが出るため、
// 埋め込みページから届く高さで iframe を伸縮させる（スクリプトが動かなくても min-height で表示はできる）。
// 先頭の style は埋め込み先（Wix の HTML 埋め込み）が付ける body の余白を消すため（Wix の枠は高さ固定なので、少しでも低くする）。
function embedCode(url: string) {
  return `<style>html,body{margin:0;padding:0;background:transparent;}</style>
<iframe
  id="oominami-calendar"
  src="${url}"
  title="営業カレンダー"
  loading="lazy"
  style="display:block; width:100%; border:0; min-height:760px; background:transparent;"
></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "${new URL(url).origin}") return;
    var d = e.data;
    if (!d || d.type !== "${EMBED_HEIGHT_MESSAGE}" || !d.height) return;
    var f = document.getElementById("oominami-calendar");
    if (!f) return;
    f.style.height = d.height + "px";
    f.style.minHeight = "0";
  });
</script>`;
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
  // 埋め込みページから届く高さ（実際のHPと同じように iframe を伸縮させる）
  const [height, setHeight] = useState<number | null>(null);
  const code = embedCode(embedUrl);
  const w = WIDTHS.find((x) => x.key === width)!;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (isEmbedHeightMessage(e.data)) setHeight(e.data.height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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
        {/* 幅を変えても iframe は貼り替えないので、高さは中身から次の通知が来るまで保つ */}
        <div className="flex overflow-hidden rounded-lg border border-gray-300">
          {WIDTHS.map((x) => (
            <button key={x.key} onClick={() => setWidth(x.key)} className={toggle(width === x.key)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-gray-300">
          <button
            onClick={() => {
              setWithDraft(false);
              setHeight(null);
            }}
            className={toggle(!withDraft)}
          >
            公開中の月だけ
          </button>
          <button
            onClick={() => {
              setWithDraft(true);
              setHeight(null);
            }}
            className={toggle(withDraft)}
          >
            準備中の月も
          </button>
        </div>
        <button
          onClick={() => {
            setReloadKey((k) => k + 1);
            setHeight(null);
          }}
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
            style={{
              display: "block",
              width: "100%",
              border: 0,
              height: height ?? undefined,
              minHeight: height ? 0 : 760,
              background: "transparent",
            }}
          />
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">ホームページ埋め込み用コード</h2>
        <p className="mt-1 text-sm text-gray-500">
          <code className="rounded bg-gray-100 px-1">&lt;iframe&gt;</code> の下の
          <code className="rounded bg-gray-100 px-1">&lt;script&gt;</code> は、カレンダーの高さに合わせて枠を伸縮させ、
          ホームページ側に内側のスクロールバーが出ないようにするものです。<strong>iframe と script の両方</strong>を貼り付けてください
          （スクリプトが使えないページでは、iframe の <code className="rounded bg-gray-100 px-1">min-height</code> を
          1200px 程度に増やしてください）。
          先頭の <code className="rounded bg-gray-100 px-1">&lt;style&gt;</code> も含めて全部貼り付けてください。
          <strong>Wix の「HTML埋め込み」の枠は高さが固定</strong>のため、枠の高さは 1000px 程度にしてください
          （カレンダーがそれより高くなると、枠の右にスクロールバーが出ます）。
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
