"use client";

import { useEffect, useState, useTransition } from "react";
import { EMBED_HEIGHT_MESSAGE, isEmbedHeightMessage, TODAY_HEIGHT_MESSAGE } from "@/lib/embed-height";
import type { ActionResult } from "../../employees/actions";
import { updateHomepageUrl } from "./actions";
import { segmentClass, segmentItemClass } from "@/lib/choice-styles";

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

// 「本日の営業」(ホームページのトップ用)。高さ合わせの仕組みはカレンダーと同じだが、
// 同じページに両方貼っても取り違えないよう、iframe の id とメッセージの種類を分けている。
function todayEmbedCode(url: string) {
  return `<iframe
  id="oominami-today"
  src="${url}"
  title="本日の営業"
  loading="lazy"
  style="display:block; width:100%; border:0; min-height:56px; background:transparent;"
></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "${new URL(url).origin}") return;
    var d = e.data;
    if (!d || d.type !== "${TODAY_HEIGHT_MESSAGE}" || !d.height) return;
    var f = document.getElementById("oominami-today");
    if (!f) return;
    f.style.height = d.height + "px";
    f.style.minHeight = "0";
  });
</script>`;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** 埋め込みコードの表示とコピー */
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">{code}</pre>
      <button
        onClick={copy}
        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {copied ? "コピーしました" : "コードをコピー"}
      </button>
    </>
  );
}

/** ホームページの URL(「ホームページを表示」で開く) */
function HomepageUrlForm({ homepageUrl, placeholder }: { homepageUrl: string; placeholder: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">ホームページの URL</h2>
      <p className="mt-1 text-sm text-gray-500">
        この画面の一番下の「ホームページを表示」で開きます（未入力なら {placeholder}）。
      </p>
      <form
        action={(fd) => startTransition(async () => setResult(await updateHomepageUrl(fd)))}
        className="mt-3 flex max-w-2xl flex-wrap items-center gap-3"
      >
        <input
          name="homepage_url"
          type="url"
          inputMode="url"
          defaultValue={homepageUrl}
          placeholder={placeholder}
          className={`${inputClass} min-w-0 flex-1 basis-64`}
        />
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
        {result && (
          <p className={`w-full text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>
        )}
      </form>
    </section>
  );
}

/** 本日の営業(ホームページのトップ用)の見え方と埋め込みコード */
function TodaySection({ todayEmbedUrl }: { todayEmbedUrl: string }) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (isEmbedHeightMessage(e.data, TODAY_HEIGHT_MESSAGE)) setHeight(e.data.height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">本日の営業（ホームページのトップ用）</h2>
      <p className="mt-1 text-sm text-gray-500">
        今日の日付・曜日（祝日名）・営業時間（前日から通しなら「昨晩からの通し」、翌日まで通しなら「通し営業」）と、
        今日のイベント（ある日だけ2行目）を表示します。ホームページの黒い背景に合わせた明るい色です。
        営業カレンダーから自動で作られ、日付が変わると表示も変わります。
      </p>
      {/* ホームページの背景(黒)に合わせて見る */}
      <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-black p-2">
        <iframe
          src="/calendar/embed/today"
          title="本日の営業（プレビュー）"
          style={{
            display: "block",
            width: "100%",
            border: 0,
            height: height ?? undefined,
            minHeight: height ? 0 : 56,
            background: "transparent",
          }}
        />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-700">本日の営業の埋め込み用コード</h3>
      <p className="mt-1 text-sm text-gray-500">
        ホームページのトップの、表示したい位置に <strong>iframe と script の両方</strong>を貼り付けてください。
        下の営業カレンダーのコードとは別物です（同じページに両方貼っても大丈夫です）。
      </p>
      <CodeBlock code={todayEmbedCode(todayEmbedUrl)} />
    </section>
  );
}

const WIDTHS = [
  { key: "pc", label: "パソコン", width: "100%" },
  { key: "sp", label: "スマホ", width: "390px" },
] as const;

export function PreviewView({
  embedUrl,
  todayEmbedUrl,
  homepageUrl,
  defaultHomepageUrl,
}: {
  embedUrl: string;
  todayEmbedUrl: string;
  homepageUrl: string;
  defaultHomepageUrl: string;
}) {
  const [width, setWidth] = useState<(typeof WIDTHS)[number]["key"]>("pc");
  const [withDraft, setWithDraft] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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

  const toggle = (active: boolean) => `${segmentItemClass(active)} px-3 py-1.5 text-sm`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ホームページ</h1>
        <p className="mt-1 text-sm text-gray-500">
          ホームページに埋め込む「本日の営業」と「営業カレンダー」の見え方と、埋め込み用のコードです。
        </p>
      </div>

      <HomepageUrlForm homepageUrl={homepageUrl} placeholder={defaultHomepageUrl} />
      <TodaySection todayEmbedUrl={todayEmbedUrl} />

      {/* 営業カレンダー(見え方の切替・プレビュー・埋め込みコード)を1つの枠にまとめる */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">営業カレンダー</h2>
        <p className="mt-1 text-sm text-gray-500">
          ホームページに埋め込むページをそのまま表示しています。日をタップすると、ホームページと同じ詳細が出ます。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* 幅を変えても iframe は貼り替えないので、高さは中身から次の通知が来るまで保つ */}
        <div className={`flex ${segmentClass}`}>
          {WIDTHS.map((x) => (
            <button key={x.key} onClick={() => setWidth(x.key)} className={toggle(width === x.key)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className={`flex ${segmentClass}`}>
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

      <div>
        <h3 className="text-sm font-semibold text-gray-700">営業カレンダーの埋め込み用コード</h3>
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
        <CodeBlock code={code} />
      </div>
      </section>

      <a
        href={homepageUrl || defaultHomepageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        ホームページを表示 ↗
      </a>
    </div>
  );
}
