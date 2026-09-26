"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  audienceLabel,
  formatBytes,
  GUIDE_SUMMARY_MAX,
  GUIDE_TITLE_MAX,
  GUIDE_VIDEO_BUCKET,
  GUIDE_VIDEO_MAX,
  GUIDE_VIDEO_TYPES,
  formatJstDateTime,
  STORAGE_FREE_BYTES,
  type AppGuide,
} from "@/lib/app-guides";
import { deleteAppGuide, discardGuideVideo, moveAppGuide, saveAppGuide } from "./actions";
import type { ActionResult } from "../employees/actions";
import { zebraRowClass } from "@/lib/table";
import { readMp4CreationTime } from "@/lib/mp4-meta";

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm";

/** アプリの解説（操作説明の動画・資料）の登録。メニュー「アプリの解説」に表示される */
export function AppGuidesForm({ guides }: { guides: AppGuide[] }) {
  const [adding, setAdding] = useState(false);
  const used = guides.reduce((sum, g) => sum + (g.video_size ?? 0), 0);
  return (
    <section id="app-guides" className="scroll-mt-20 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">アプリの解説</h2>
      <p className="mt-1 text-sm text-gray-500">
        操作説明の動画や資料です。メニューの「アプリの解説」に、公開対象の人だけに表示されます。
        動画は<b>アプリに保存</b>すると、スマホでも画面いっぱいに再生できます（1本50MBまで・mp4）。
        資料などは URL でも登録できます。
      </p>
      <p className="mt-1 text-xs text-gray-500">
        アプリに保存した動画: 合計 {formatBytes(used)}（無料枠の保存容量 {formatBytes(STORAGE_FREE_BYTES)} のうち）。
        再生のたびに通信量（無料枠は月5GB）を使います。
      </p>
      {guides.length === 0 && !adding && <p className="mt-4 text-sm text-gray-400">まだ登録されていません。</p>}
      {guides.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-blue-50/70 text-left text-xs text-gray-600">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">公開対象</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">タイトル</th>
                <th className="px-3 py-2 font-semibold">解説</th>
                <th className="px-3 py-2" aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {guides.map((g, i) => (
                <GuideRow
                  key={`${g.id}-${g.title}-${g.url}-${g.video_path}-${g.summary}-${g.for_admin}-${g.for_employee}`}
                  guide={g}
                  index={i}
                  first={i === 0}
                  last={i === guides.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 max-w-2xl">
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

/** 一覧の1行（公開対象｜タイトル｜解説の冒頭｜↑↓編集）。「編集」でその下にフォームを開く */
function GuideRow({ guide, index, first, last }: { guide: AppGuide; index: number; first: boolean; last: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function move(dir: -1 | 1) {
    startTransition(async () => {
      const r = await moveAppGuide(guide.id, dir);
      if (r.ok) router.refresh();
    });
  }

  const btn = "rounded-lg border px-2 py-1 text-sm disabled:opacity-30";
  return (
    <>
      <tr className={`${zebraRowClass(index)} border-t border-gray-100`}>
        <td className="whitespace-nowrap px-3 py-2">
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">{audienceLabel(guide)}</span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 font-semibold text-gray-800">
          <span className="mr-1" title={guide.video_path ? "アプリに保存した動画" : "URL"}>
            {guide.video_path ? "🎬" : "🔗"}
          </span>
          {guide.title}
        </td>
        <td className="max-w-[18rem] px-3 py-2 text-gray-600">
          <span className="block truncate" title={guide.summary}>
            {guide.summary || <span className="text-gray-400">—</span>}
          </span>
          <span className="mt-0.5 block whitespace-nowrap text-xs text-gray-500">
            {guide.video_path
              ? `作成日時: ${guide.video_created_at ? formatJstDateTime(guide.video_created_at) : "未登録"}`
              : `更新日時: ${formatJstDateTime(guide.updated_at)}`}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <span className="inline-flex gap-1">
            <button onClick={() => move(-1)} disabled={pending || first} aria-label="上へ" className={`${btn} border-gray-300 bg-white text-gray-600`}>
              ↑
            </button>
            <button onClick={() => move(1)} disabled={pending || last} aria-label="下へ" className={`${btn} border-gray-300 bg-white text-gray-600`}>
              ↓
            </button>
            <button
              onClick={() => setEditing((v) => !v)}
              className={`${btn} border-blue-600 bg-white px-3 font-medium text-blue-700 hover:bg-blue-50`}
            >
              {editing ? "閉じる" : "編集"}
            </button>
          </span>
        </td>
      </tr>
      {editing && (
        <tr className={zebraRowClass(index)}>
          <td colSpan={4} className="px-3 pb-3">
            <GuideEditor guide={guide} onDone={() => setEditing(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

type Kind = "video" | "url";

/** 追加・編集フォーム（guide が null なら追加） */
function GuideEditor({ guide, onDone }: { guide: AppGuide | null; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(guide?.title ?? "");
  const [kind, setKind] = useState<Kind>(guide && !guide.video_path ? "url" : "video");
  const [url, setUrl] = useState(guide?.url ?? "");
  const [file, setFile] = useState<File | null>(null);
  // 動画ファイルの作成日時（ISO）。動画を選ぶと自動で読む。source は画面の説明用
  const [createdAt, setCreatedAt] = useState<string | null>(guide?.video_created_at ?? null);
  const [createdSource, setCreatedSource] = useState<"video" | "file" | null>(null);
  const [summary, setSummary] = useState(guide?.summary ?? "");
  const [forAdmin, setForAdmin] = useState(guide?.for_admin ?? true);
  const [forEmployee, setForEmployee] = useState(guide?.for_employee ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || uploading;

  function pickFile(f: File | null) {
    setResult(null);
    if (f && !GUIDE_VIDEO_TYPES.includes(f.type)) {
      setResult({ ok: false, message: "mp4（またはmov）の動画を選んでください" });
      setFile(null);
      return;
    }
    if (f && f.size > GUIDE_VIDEO_MAX) {
      setResult({ ok: false, message: `動画は${formatBytes(GUIDE_VIDEO_MAX)}までです（選んだファイル: ${formatBytes(f.size)}）` });
      setFile(null);
      return;
    }
    setFile(f);
    if (!f) return;
    // 作成日時: 動画の中に記録された日時（mvhd）。記録がない動画（ffmpeg 書き出しなど）はファイルの更新日時
    readMp4CreationTime(f).then((d) => {
      setCreatedAt((d ?? new Date(f.lastModified)).toISOString());
      setCreatedSource(d ? "video" : "file");
    });
  }

  function save() {
    startTransition(async () => {
      setResult(null);
      let videoPath = kind === "video" ? guide?.video_path ?? null : null;
      let videoSize = kind === "video" ? guide?.video_size ?? null : null;
      let uploaded: string | null = null;

      // 新しい動画はブラウザから Storage へ直接アップロードしてから記録する
      if (kind === "video" && file) {
        setUploading(true);
        const ext = file.type === "video/quicktime" ? "mov" : "mp4";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await createClient()
          .storage.from(GUIDE_VIDEO_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        setUploading(false);
        if (error) {
          setResult({ ok: false, message: `動画のアップロードに失敗しました（${error.message}）` });
          return;
        }
        videoPath = path;
        videoSize = file.size;
        uploaded = path;
      }

      const r = await saveAppGuide({
        id: guide?.id ?? null,
        title,
        kind,
        url,
        video_path: videoPath,
        video_size: videoSize,
        video_created_at: kind === "video" ? createdAt : null,
        summary,
        for_admin: forAdmin,
        for_employee: forEmployee,
      });
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone();
      } else if (uploaded) {
        await discardGuideVideo(uploaded);
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
          placeholder="例: 営業カレンダーの使い方"
          className={inputClass}
        />
      </label>

      <div>
        <span className="mb-1 block text-xs font-medium text-gray-500">内容</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["video", "🎬 動画をアプリに保存"],
              ["url", "🔗 URL（リンク）"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setResult(null);
              }}
              className={`rounded-lg border px-2 py-2 text-sm font-bold ${
                kind === k ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {kind === "video" ? (
        <div className="space-y-1">
          {guide?.video_path && !file && (
            <p className="text-sm text-gray-700">保存済みの動画（{formatBytes(guide.video_size ?? 0)}）。差し替える場合は新しいファイルを選んでください。</p>
          )}
          <input
            type="file"
            accept="video/mp4,video/quicktime"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
          {file && <p className="text-xs text-gray-600">選んだファイル: {file.name}（{formatBytes(file.size)}）</p>}
          <p className="text-xs text-gray-500">mp4 で {formatBytes(GUIDE_VIDEO_MAX)} まで。</p>
          <p className="text-sm text-gray-700">
            作成日時: {createdAt ? formatJstDateTime(createdAt) : "（動画を選ぶと自動で入ります）"}
            {file && createdSource && (
              <span className="ml-1 text-xs text-gray-500">
                {createdSource === "video" ? "（動画に記録された作成日時）" : "（動画に記録がないため、ファイルの更新日時）"}
              </span>
            )}
          </p>
        </div>
      ) : (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">URL（資料・動画へのリンク）</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://..."
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-gray-500">更新日時は、保存したときに自動で記録されます。</span>
          {guide?.video_path && (
            <span className="mt-1 block text-xs text-orange-700">保存すると、アプリに保存していた動画は削除されます。</span>
          )}
        </label>
      )}

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
      {uploading && <p className="text-sm text-blue-700">動画をアップロードしています…（大きさによって数十秒かかります）</p>}
      {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {uploading ? "アップロード中..." : pending ? "保存中..." : "保存"}
        </button>
        <button onClick={onDone} disabled={busy} className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700">
          やめる
        </button>
        {guide &&
          (confirmDelete ? (
            <button onClick={remove} disabled={busy} className="ml-auto rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white">
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
