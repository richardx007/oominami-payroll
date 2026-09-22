"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSwipeNav } from "@/lib/useSwipeNav";
import { CalendarLegend, MonthCalendar } from "@/components/business-calendar/MonthCalendar";
import {
  addMonthsYm,
  dayOfWeek,
  DAY_TYPE_LABELS,
  draftDeadline,
  EVENT_COLORS,
  FOOTNOTE_MAX,
  FOOTNOTE_TEXT_CLASS,
  formatMinutes,
  minutesToInput,
  MONTH_STATE_LABELS,
  monthState,
  parseTimeInput,
  type BusinessDayRow,
  type CalendarEventRow,
  type DayType,
  type EventTypeRow,
  type MonthState,
} from "@/lib/business-calendar-view";
import { deleteEvent, generateMonth, saveDay, saveEvent, saveFootnote } from "./actions";
import type { ActionResult } from "../employees/actions";

export type DayDetailRow = { day_type: DayType; note: string | null };
export type EventDetailRow = { is_public: boolean };
type DayRow = BusinessDayRow & DayDetailRow;
type EventRow = CalendarEventRow & EventDetailRow;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm";

/** 状態の色（アプリ全体の原則: 未確定=イエロー、確定=グリーン） */
const STATE_BADGE: Record<MonthState, string> = {
  none: "bg-gray-100 text-gray-500",
  draft: "bg-yellow-200 text-yellow-900",
  public: "bg-green-100 text-green-800",
};

function ymLabel(ym: string) {
  return `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
}

function mdLabel(key: string) {
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
}

function Message({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>;
}

export function CalendarManager({
  ym,
  today,
  days,
  events,
  types,
  generatedMonths,
  footnote,
  holidays,
  holidaySyncError,
}: {
  ym: string;
  today: string;
  days: DayRow[];
  events: EventRow[];
  types: EventTypeRow[];
  generatedMonths: string[];
  /** この月の注釈 */
  footnote: string;
  holidays: Record<string, string>;
  holidaySyncError: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const generated = new Set(generatedMonths);
  const state = monthState(ym, today, generated.has(ym));
  const href = (m: string) => `/admin/calendar?ym=${m}`;
  const go = (m: string) => {
    setSelected(null);
    setResult(null);
    router.push(href(m));
  };

  const { blank, attach } = useSwipeNav(
    () => go(addMonthsYm(ym, 1)),
    () => go(addMonthsYm(ym, -1)),
    ym
  );

  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const selectedRow = selected ? dayByDate.get(selected) : undefined;

  function create() {
    startTransition(async () => {
      const r = await generateMonth(ym);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-3">
        {/* 月ナビ */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => go(addMonthsYm(ym, -1))}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </button>
          <span className="whitespace-nowrap text-lg font-extrabold tracking-tight text-blue-800">
            {ymLabel(ym)}
          </span>
          <button
            onClick={() => go(addMonthsYm(ym, 1))}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <HeaderIconLink href="/admin/calendar/preview" label="ホームページでの見え方">
              <EyeIcon />
            </HeaderIconLink>
            <HeaderIconLink href={`/admin/calendar/poster?ym=${ym}`} label="ポスター（PDF・画像）">
              <PosterIcon />
            </HeaderIconLink>
            <HeaderIconLink href="/admin/calendar/patterns" label="営業時間の定義">
              <GearIcon />
            </HeaderIconLink>
            <HeaderIconLink href="/admin/settings#event-types" label="イベントの種類と色">
              <PaletteIcon />
            </HeaderIconLink>
          </div>
        </div>

        {/* 状態バッジ。年月と同じ行に置くとスマホで年月が折り返すため2行目に出す */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`inline-block shrink-0 rounded-lg px-2.5 py-1 text-base font-bold ${STATE_BADGE[state]}`}>
            {MONTH_STATE_LABELS[state]}
          </span>
          <span className="text-xs text-gray-500">
            日をタップすると変更できます。<span className="text-orange-500">●</span>：変更あり
          </span>
        </div>

        {/* 状態の説明（公開中は状態バッジで分かるので文章は出さない） */}
        {state === "draft" &&
          (() => {
            const { publishFrom, deadline, daysLeft } = draftDeadline(ym, today);
            return (
              <p className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">
                <b>
                  {mdLabel(deadline)}
                  {daysLeft >= 0 ? `（あと${daysLeft}日）` : ""}までに直してください。
                </b>
                {mdLabel(publishFrom)}から自動でホームページに表示されます。
              </p>
            );
          })()}
        {state === "none" && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
            <p>
              この月はまだ作成されていません。毎月15日に翌々月分が自動で作成されます。
              今すぐ作る場合は下のボタンを押してください（営業時間の定義から作ります。過去の月も作成できます）。
            </p>
            <button
              onClick={create}
              disabled={pending}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "作成中..." : `${Number(ym.slice(5, 7))}月分を今すぐ作成`}
            </button>
            {holidaySyncError && (
              <p className="mt-2 text-xs text-red-600">祝日データの取得に失敗しています（{holidaySyncError}）</p>
            )}
          </div>
        )}
        <Message result={result} />

        <div className="overflow-hidden">
          <MonthCalendar
            ym={ym}
            days={days}
            events={events}
            types={types}
            holidays={holidays}
            today={today}
            selected={selected}
            onSelect={(d) => setSelected(selected === d ? null : d)}
            showManual
            blank={blank}
            attach={attach}
          />
        </div>
        {state !== "none" && <FootnoteForm key={`${ym}-${footnote}`} ym={ym} initial={footnote} />}
        <CalendarLegend types={types} />
      </div>

      {/* 右カラム(スマホでは下): 選択日の編集 */}
      <div className="lg:sticky lg:top-20">
        {selected ? (
          <DayPanel
            key={selected}
            date={selected}
            row={selectedRow}
            events={events.filter((e) => e.start_date <= selected && e.end_date >= selected)}
            types={types}
            onClose={() => setSelected(null)}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            日付を選ぶと、その日の営業時間やイベントを変更できます
          </p>
        )}
      </div>
    </div>
  );
}

/** 月の注釈（カレンダーの真下。HP・ポスターにも同じ赤の太字で出る） */
function FootnoteForm({ ym, initial }: { ym: string; initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await saveFootnote(ym, text);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <h2 className="border-l-4 border-blue-600 pl-2 text-sm font-semibold">{Number(ym.slice(5, 7))}月の注釈</h2>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        rows={2}
        maxLength={FOOTNOTE_MAX}
        aria-label={`${Number(ym.slice(5, 7))}月の注釈`}
        className={`${inputClass} resize-none leading-snug ${FOOTNOTE_TEXT_CLASS}`}
      />
      <Message result={result} />
      <button
        onClick={save}
        disabled={pending || text === initial}
        className="w-full rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "保存中..." : "注釈を保存する"}
      </button>
    </section>
  );
}

/** カレンダー右上のアイコンボタン（関連画面へのリンク） */
function HeaderIconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-blue-700"
    >
      {children}
    </Link>
  );
}

const iconProps = {
  className: "h-5 w-5",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function EyeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PosterIcon() {
  return (
    <svg {...iconProps}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2A4.5 4.5 0 0 0 21 10.7C21 6.4 17 3 12 3z" />
      <circle cx="7.5" cy="11" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

type Mode = "usual" | "hours" | "closed";

function DayPanel({
  date,
  row,
  events,
  types,
  onClose,
}: {
  date: string;
  row: DayRow | undefined;
  events: EventRow[];
  types: EventTypeRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const initialMode: Mode = !row?.is_manual ? "usual" : row.status === "temp_closed" ? "closed" : "hours";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [open, setOpen] = useState(minutesToInput(row?.open_min ?? 600));
  const [close, setClose] = useState(minutesToInput(row?.close_min ?? 1440));
  const [overnight, setOvernight] = useState(row?.overnight ?? false);
  const [note, setNote] = useState(row?.note ?? "");
  const [editingEvent, setEditingEvent] = useState<EventRow | "new" | null>(null);

  const dow = dayOfWeek(date);
  const red = !!row?.holiday_name || dow === 0;

  function current(): string {
    if (!row) return "";
    if (row.status === "temp_closed") return "臨時休業";
    if (row.status === "closed") return "定休";
    const o = row.open_min != null ? formatMinutes(row.open_min) : "";
    return row.overnight ? `${o}〜翌日まで通し` : `${o}〜${row.close_min != null ? formatMinutes(row.close_min) : ""}`;
  }

  function save() {
    startTransition(async () => {
      let r: ActionResult;
      if (mode === "usual") {
        r = await saveDay({ mode: "usual", date });
      } else if (mode === "closed") {
        r = await saveDay({ mode: "closed", date, note });
      } else {
        const o = parseTimeInput(open);
        const c = overnight ? null : parseTimeInput(close);
        if (o == null || o >= 1440 || (!overnight && c == null)) {
          setResult({ ok: false, message: "時刻は 10:00 のように入力してください（深夜は 26:00）" });
          return;
        }
        r = await saveDay({ mode: "hours", date, open_min: o, close_min: c, overnight, note });
      }
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-lg font-bold ${red ? "text-red-600" : dow === 6 ? "text-blue-600" : "text-gray-800"}`}>
            {mdLabel(date)}（{WEEKDAYS[dow]}
            {row?.holiday_name ? "・祝" : ""}）
            {row?.holiday_name && <span className="ml-1 text-sm font-medium">{row.holiday_name}</span>}
          </p>
          {row && (
            <p className="mt-0.5 text-sm text-gray-600">
              {current()}
              <span className="ml-2 text-xs text-gray-400">区分: {DAY_TYPE_LABELS[row.day_type]}</span>
              {row.is_manual && <span className="ml-2 text-xs text-orange-600">● 手で変更</span>}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="rounded-lg px-2 py-1 text-xl text-gray-500 hover:bg-gray-100"
        >
          ×
        </button>
      </div>

      {!row ? (
        <p className="text-sm text-gray-500">この月はまだ作成されていないため、営業時間は変更できません。</p>
      ) : (
        <section className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["usual", "いつもどおり"],
                ["hours", "時間を変える"],
                ["closed", "臨時休業"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setResult(null);
                }}
                className={`rounded-lg border px-1 py-2.5 text-sm font-bold transition ${
                  mode === m
                    ? m === "closed"
                      ? "border-red-500 bg-red-500 text-white"
                      : "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "usual" && (
            <p className="text-sm text-gray-600">
              {row.is_manual
                ? "営業時間の定義どおりに戻します。メモも消えます。"
                : "営業時間の定義どおりです。"}
            </p>
          )}

          {mode === "hours" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">開店</span>
                  <input value={open} onChange={(e) => setOpen(e.target.value)} placeholder="10:00" inputMode="numeric" className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">閉店</span>
                  <input
                    value={overnight ? "" : close}
                    onChange={(e) => setClose(e.target.value)}
                    placeholder={overnight ? "通し" : "24:00"}
                    disabled={overnight}
                    inputMode="numeric"
                    className={`${inputClass} disabled:bg-gray-100`}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={overnight} onChange={(e) => setOvernight(e.target.checked)} className="h-4 w-4" />
                翌日まで通し（お泊まり可）
              </label>
              <p className="text-xs text-gray-500">深夜0時をまたぐ閉店は 26:00 のように書きます。</p>
            </div>
          )}

          {mode !== "usual" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">管理用メモ（ホームページには出ません）</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputClass} />
            </label>
          )}

          <Message result={result} />
          <button
            onClick={save}
            disabled={pending || (mode === "usual" && !row.is_manual)}
            className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {pending ? "保存中..." : "保存する"}
          </button>
        </section>
      )}

      {/* イベント */}
      <section className="space-y-2 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">イベント・お知らせ</h3>
          {editingEvent === null && (
            <button
              onClick={() => setEditingEvent("new")}
              className="rounded-lg border border-blue-600 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              ＋ 追加
            </button>
          )}
        </div>
        {events.length === 0 && editingEvent === null && <p className="text-sm text-gray-500">この日のイベントはありません。</p>}
        {events.map((e) =>
          editingEvent !== null && editingEvent !== "new" && editingEvent.id === e.id ? null : (
            <EventItem key={e.id} ev={e} types={types} onEdit={() => setEditingEvent(e)} />
          )
        )}
        {editingEvent !== null && (
          <EventForm
            key={editingEvent === "new" ? "new" : editingEvent.id}
            date={date}
            ev={editingEvent === "new" ? null : editingEvent}
            types={types}
            onDone={() => setEditingEvent(null)}
          />
        )}
      </section>
    </div>
  );
}

function EventItem({ ev, types, onEdit }: { ev: EventRow; types: EventTypeRow[]; onEdit: () => void }) {
  const t = types.find((x) => x.id === ev.type_id) ?? types.find((x) => x.is_default);
  const c = EVENT_COLORS[t?.color ?? "gold"];
  const range = ev.start_date === ev.end_date ? mdLabel(ev.start_date) : `${mdLabel(ev.start_date)}〜${mdLabel(ev.end_date)}`;
  return (
    <button
      onClick={onEdit}
      className="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left hover:opacity-80"
      style={{ borderColor: c.line, backgroundColor: c.soft }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold" style={{ color: c.text }}>
          {ev.title}
        </span>
        <span className="block text-xs text-gray-600">
          {t?.name ?? "イベント"}・{range}
          {!ev.is_public && "・非公開"}
        </span>
      </span>
      <span className="shrink-0 text-xs text-gray-500">編集</span>
    </button>
  );
}

function EventForm({
  date,
  ev,
  types,
  onDone,
}: {
  date: string;
  ev: EventRow | null;
  types: EventTypeRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(ev?.title ?? "");
  const [start, setStart] = useState(ev?.start_date ?? date);
  const [end, setEnd] = useState(ev?.end_date ?? date);
  const [typeId, setTypeId] = useState(ev?.type_id ?? types.find((t) => t.is_default)?.id ?? types[0]?.id ?? "");
  const [isPublic, setIsPublic] = useState(ev?.is_public ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function submit() {
    startTransition(async () => {
      const r = await saveEvent({
        id: ev?.id ?? null,
        title,
        start_date: start,
        end_date: end < start ? start : end,
        type_id: typeId || null,
        is_public: isPublic,
      });
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  function remove() {
    if (!ev) return;
    startTransition(async () => {
      const r = await deleteEvent(ev.id);
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg bg-gray-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">タイトル</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="例: 夏祭り" className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => {
          const c = EVENT_COLORS[t.color];
          const active = typeId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeId(t.id)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${active ? "ring-2 ring-blue-500" : ""}`}
              style={{ borderColor: c.line, backgroundColor: c.soft, color: c.text }}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      {/* iOS の日付入力は指定幅より広く描画されるため、横に並べず1行ずつ置く */}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">開始日</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputClass} appearance-none bg-white`} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">終了日（1日だけなら開始日と同じ）</span>
        <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={`${inputClass} appearance-none bg-white`} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4" />
        ホームページに表示する
      </label>
      <Message result={result} />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
        <button onClick={onDone} disabled={pending} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">
          やめる
        </button>
        {ev &&
          (confirmDelete ? (
            <button onClick={remove} disabled={pending} className="ml-auto rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white">
              本当に削除する
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="ml-auto rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600">
              削除
            </button>
          ))}
      </div>
    </div>
  );
}
