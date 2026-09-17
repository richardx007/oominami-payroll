"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EVENT_COLOR_KEYS,
  EVENT_COLORS,
  type EventColor,
  type EventTypeRow,
} from "@/lib/business-calendar-view";
import { deleteEventType, saveEventType } from "../calendar/actions";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** 営業カレンダーのイベントの種類と色 */
export function EventTypesForm({ types }: { types: EventTypeRow[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section id="event-types" className="scroll-mt-20 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">イベントの種類と色（営業カレンダー）</h2>
      <p className="mt-1 text-sm text-gray-500">
        営業カレンダーに載せるイベント・お知らせの種類です。色は管理画面・ホームページ・ポスターに反映されます。
        緑（営業時間）と赤（臨時休業）は紛らわしいため選べません。
      </p>
      <div className="mt-4 max-w-xl space-y-2">
        {types.map((t) => (
          <TypeRow key={`${t.id}-${t.name}-${t.color}`} type={t} />
        ))}
        {adding ? (
          <TypeRow type={null} onDone={() => setAdding(false)} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            ＋ 種類を追加
          </button>
        )}
      </div>
    </section>
  );
}

function TypeRow({ type, onDone }: { type: EventTypeRow | null; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(type?.name ?? "");
  const [color, setColor] = useState<EventColor>(type?.color ?? "gold");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = !type || name !== type.name || color !== type.color;
  const c = EVENT_COLORS[color];

  function save() {
    startTransition(async () => {
      const r = await saveEventType({ id: type?.id ?? null, name, color });
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone?.();
      }
    });
  }

  function remove() {
    if (!type) return;
    startTransition(async () => {
      const r = await deleteEventType(type.id);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 rounded border px-2 py-0.5 text-sm font-semibold"
          style={{ borderColor: c.line, backgroundColor: c.soft, color: c.text }}
        >
          {name || "（名前）"}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={12}
          placeholder="例: ライブ"
          className={inputClass}
        />
        {type?.is_default && <span className="shrink-0 text-xs text-gray-400">既定</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_COLOR_KEYS.map((k) => {
          const cc = EVENT_COLORS[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setColor(k)}
              aria-label={cc.label}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                color === k ? "ring-2 ring-blue-500 ring-offset-1" : ""
              }`}
              style={{ borderColor: cc.line, backgroundColor: cc.soft, color: cc.text }}
            >
              {cc.label}
            </button>
          );
        })}
      </div>
      {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {pending ? "保存中..." : "保存"}
        </button>
        {!type && (
          <button onClick={onDone} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700">
            やめる
          </button>
        )}
        {type &&
          !type.is_default &&
          (confirmDelete ? (
            <button onClick={remove} disabled={pending} className="ml-auto rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white">
              本当に削除する
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto rounded-lg border border-red-300 px-4 py-1.5 text-sm text-red-600"
            >
              削除
            </button>
          ))}
      </div>
      {confirmDelete && (
        <p className="text-xs text-gray-500">この種類のイベントは、既定の種類（イベント）の色で表示されるようになります。</p>
      )}
    </div>
  );
}
