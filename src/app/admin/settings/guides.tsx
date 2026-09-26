"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { audienceLabel, GUIDE_SUMMARY_MAX, GUIDE_TITLE_MAX, type AppGuide } from "@/lib/app-guides";
import { deleteAppGuide, moveAppGuide, saveAppGuide } from "./actions";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm";

/** アプリの解説（操作説明の動画・資料へのリンク）の登録。メニュー「アプリの解説」に表示される */
export function AppGuidesForm({ guides }: { guides: AppGuide[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section id="app-guides" className="scroll-mt-20 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">アプリの解説</h2>
      <p className="mt-1 text-sm text-gray-500">
        操作説明の動画や資料へのリンクです。メニューの「アプリの解説」に、公開対象の人だけに表示されます。
        Google ドライブの動画は、共有設定を「リンクを知っている全員」（閲覧者）にしてからリンクをコピーしてください。
      </p>
      <div className="mt-4 max-w-2xl space-y-2">
        {guides.length === 0 && !adding && <p className="text-sm text-gray-400">まだ登録されていません。</p>}
        {guides.map((g, i) => (
          <GuideRow
            key={`${g.id}-${g.title}-${g.url}-${g.summary}-${g.for_admin}-${g.for_employee}`}
            guide={g}
            first={i === 0}
            last={i === guides.length - 1}
          />
        ))}
        {adding ? (
          <GuideEditor guide={null} onDone={() => setAdding(false)} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            ＋ 解説を追加
          </button>
        )}
      </div>
    </section>
  );
}

/** 一覧の1行（タップで編集を開く）。上下ボタンで並べ替え */
function GuideRow({ guide, first, last }: { guide: AppGuide; first: boolean; last: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function move(dir: -1 | 1) {
    startTransition(async () => {
      const r = await moveAppGuide(guide.id, dir);
      if (r.ok) router.refresh();
    });
  }

  if (editing) return <GuideEditor guide={guide} onDone={() => setEditing(false)} />;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-gray-200 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-800">{guide.title}</p>
        <p className="truncate text-xs text-gray-500">{guide.url}</p>
        <p className="mt-1 text-xs">
          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">{audienceLabel(guide)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => move(-1)}
          disabled={pending || first}
          aria-label="上へ"
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-600 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          onClick={() => move(1)}
          disabled={pending || last}
          aria-label="下へ"
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-600 disabled:opacity-30"
        >
          ↓
        </button>
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg border border-blue-600 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          編集
        </button>
      </div>
    </div>
  );
}

/** 追加・編集フォーム（guide が null なら追加） */
function GuideEditor({ guide, onDone }: { guide: AppGuide | null; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(guide?.title ?? "");
  const [url, setUrl] = useState(guide?.url ?? "");
  const [summary, setSummary] = useState(guide?.summary ?? "");
  const [forAdmin, setForAdmin] = useState(guide?.for_admin ?? true);
  const [forEmployee, setForEmployee] = useState(guide?.for_employee ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await saveAppGuide({
        id: guide?.id ?? null,
        title,
        url,
        summary,
        for_admin: forAdmin,
        for_employee: forEmployee,
      });
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  function remove() {
    if (!guide) return;
    startTransition(async () => {
      const r = await deleteAppGuide(guide.id);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">タイトル</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={GUIDE_TITLE_MAX}
          placeholder="例: 営業カレンダーの使い方（動画）"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">URL（動画・資料へのリンク）</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="https://drive.google.com/file/d/..."
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">概略</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={GUIDE_SUMMARY_MAX}
          rows={3}
          placeholder="例: 臨時休業・営業時間の変更・イベントの登録と、ホームページへの反映について（約2分）"
          className={`${inputClass} resize-none leading-snug`}
        />
      </label>
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-500">公開対象（両方選べます）</span>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={forAdmin} onChange={(e) => setForAdmin(e.target.checked)} className="h-4 w-4" />
            管理者
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={forEmployee} onChange={(e) => setForEmployee(e.target.checked)} className="h-4 w-4" />
            従業員
          </label>
        </div>
      </div>
      {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {pending ? "保存中..." : "保存"}
        </button>
        <button onClick={onDone} disabled={pending} className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700">
          やめる
        </button>
        {guide &&
          (confirmDelete ? (
            <button onClick={remove} disabled={pending} className="ml-auto rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white">
              本当に削除する
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto rounded-lg border border-red-300 bg-white px-4 py-1.5 text-sm text-red-600"
            >
              削除
            </button>
          ))}
      </div>
    </div>
  );
}
