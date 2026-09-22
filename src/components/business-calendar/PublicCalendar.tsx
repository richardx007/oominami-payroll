"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  addDaysKey,
  addMonthsYm,
  buildCalendarView,
  dayOfWeek,
  diffDays,
  EVENT_COLORS,
  footnoteLines,
  jstTodayKey,
  layoutWeek,
  monthGridKeys,
  STAY_LABEL,
  weekdayHeaderBg,
  type BusinessDayRow,
  type CalendarEventRow,
  type CalendarView,
  type EventTypeRow,
  type MonthFootnote,
} from "@/lib/business-calendar-view";

/**
 * ホームページ埋め込み用の営業カレンダー（旧 oominami-calendar の見た目を移植）。
 * /calendar/embed と管理画面のプレビュー（iframe で同じページを表示）で使う。
 * 色は旧アプリのデザイントークンをそのまま使う（Tailwind の配色とは独立）。
 */

export type CalendarData = {
  days: BusinessDayRow[];
  events: CalendarEventRow[];
  types: EventTypeRow[];
  /** 月ごとの注釈（古いAPI応答には無い） */
  notes?: MonthFootnote[];
};

export type CalendarLoader = (from: string, to: string) => Promise<CalendarData>;

const STORE_NAME = "オオミナミ　営業カレンダー";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const TOKENS = {
  "--c-card": "#ffffff",
  "--c-surface-2": "#f6f6f8",
  "--c-border": "#e7e7ec",
  "--c-border-strong": "#d8d8df",
  "--c-outline": "#9aa1ab",
  "--c-outside": "#e4e6ec",
  "--c-text": "#1f2328",
  "--c-muted": "#6b7280",
  "--c-faint": "#9aa1ab",
  "--c-brand": "#d81f2a",
  "--c-open": "#1f9d55",
  "--c-open-soft": "#e7f6ee",
  "--c-open-line": "#4bb083",
  "--c-event": "#b8860b",
  "--c-event-soft": "#fbf1d9",
  "--c-event-line": "#d3a94e",
  "--c-note": "#374151",
} as CSSProperties;

const chipBase =
  "pointer-events-none block mx-px truncate rounded border px-0.5 py-px text-[8px] leading-tight sm:mx-0.5 sm:px-1 sm:text-[13px]";
const openChip = `${chipBase} border-[var(--c-open-line)] bg-[var(--c-open-soft)] font-medium text-[var(--c-open)]`;
const closedChip = `${chipBase} border-[var(--c-brand)] bg-[var(--c-event-soft)] font-semibold text-[var(--c-brand)]`;
// 「泊まり可」は営業時間の補足なので、枠を付けず濃いグレーの文字だけで出す
const stayNote =
  "pointer-events-none mx-px block truncate px-0.5 py-px text-[8px] font-semibold leading-tight text-[var(--c-note)] sm:mx-0.5 sm:px-1 sm:text-[13px]";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

const navBtn =
  "grid h-10 w-10 place-items-center rounded-full border border-[var(--c-border-strong)] bg-[#e9ebef] text-[var(--c-text)] transition hover:border-[var(--c-brand)] hover:bg-[var(--c-brand)] hover:text-white sm:h-11 sm:w-11";

export function PublicCalendar({
  loader,
  maxYm,
  note,
}: {
  loader: CalendarLoader;
  /** 翌月へ進める上限（HPは翌月まで） */
  maxYm: (todayYm: string) => string;
  /** カード下部の注記（プレビュー用） */
  note?: ReactNode;
}) {
  const today = jstTodayKey();
  const todayYm = today.slice(0, 7);
  const [ym, setYm] = useState(todayYm);
  const [selected, setSelected] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, CalendarData | "error">>({});
  const limit = maxYm(todayYm);
  const data = cache[ym];

  useEffect(() => {
    if (cache[ym]) return;
    const grid = monthGridKeys(ym);
    // 月をまたぐ通し営業の始まり・終わりを正しく出すため、前後に余裕をもって読む
    loader(addDaysKey(grid[0], -14), addDaysKey(grid[grid.length - 1], 14))
      .then((d) => setCache((c) => ({ ...c, [ym]: d })))
      .catch(() => setCache((c) => ({ ...c, [ym]: "error" })));
  }, [ym, cache, loader]);

  const go = (next: string) => {
    setSelected(null);
    setYm(next > limit ? limit : next);
  };

  return (
    <div style={TOKENS} className="flex justify-center p-1 text-[var(--c-text)] sm:p-6">
      <div className="flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-2 shadow-sm sm:gap-4 sm:rounded-2xl sm:p-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold tracking-wide sm:text-xl">{STORE_NAME}</h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(addMonthsYm(ym, -1))} aria-label="前の月" className={navBtn}>
              <Chevron dir="left" />
            </button>
            <div className="flex min-w-[8.5rem] items-baseline justify-center gap-0.5 tabular-nums sm:min-w-[10rem]">
              <span className="text-sm font-bold sm:text-base">{ym.slice(0, 4)}年</span>
              <span className="text-2xl font-bold sm:text-3xl">{Number(ym.slice(5, 7))}月</span>
            </div>
            <button
              type="button"
              onClick={() => go(addMonthsYm(ym, 1))}
              disabled={ym >= limit}
              aria-label="次の月"
              className={`${navBtn} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[var(--c-border-strong)] disabled:hover:bg-[#e9ebef] disabled:hover:text-[var(--c-text)]`}
            >
              <Chevron dir="right" />
            </button>
            <button
              type="button"
              onClick={() => go(todayYm)}
              className="ml-1 rounded-full border border-[var(--c-border-strong)] px-3.5 py-2 text-sm font-medium text-[var(--c-muted)] transition hover:border-[var(--c-brand)] hover:text-[var(--c-brand)]"
            >
              今日
            </button>
          </div>
        </div>

        {data === "error" ? (
          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)] px-4 py-6 text-center text-sm text-[var(--c-muted)]">
            カレンダーを読み込めませんでした。
          </div>
        ) : data ? (
          <Grid ym={ym} data={data} today={today} selected={selected} onSelect={(k) => setSelected((p) => (p === k ? null : k))} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--c-border)]">
            <div className="grid grid-cols-7 gap-px bg-[var(--c-border)]">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-[4.75rem] animate-pulse bg-[var(--c-surface-2)] sm:min-h-[6.75rem]" />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Legend types={data && data !== "error" ? data.types : []} />
        </div>
        {data && data !== "error" && <Footnotes lines={footnoteLines(data.notes, ym)} />}
        {note}
      </div>
    </div>
  );
}

/** 月ごとの注釈（2行まで） */
function Footnotes({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="space-y-0.5 text-sm leading-snug text-[var(--c-note)] sm:text-base">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

function Legend({ types }: { types: EventTypeRow[] }) {
  const sorted = [...types].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--c-muted)] sm:text-base">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--c-open)]" />
        営業時間
      </span>
      {sorted.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_COLORS[t.color].text }} />
          {t.name}
        </span>
      ))}
    </div>
  );
}

function Grid({
  ym,
  data,
  today,
  selected,
  onSelect,
}: {
  ym: string;
  data: CalendarData;
  today: string;
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  const view = useMemo(() => buildCalendarView(data.days, data.events, data.types), [data]);
  const keys = monthGridKeys(ym);
  const weeks: string[][] = [];
  for (let i = 0; i < keys.length; i += 7) weeks.push(keys.slice(i, i + 7));
  const headerBg = weekdayHeaderBg(ym);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-[var(--c-outline)]">
      <div className="grid grid-cols-7 border-b-2 border-[var(--c-outline)]" style={{ backgroundColor: headerBg }}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-1.5 text-center text-xl font-bold sm:py-2 sm:text-2xl ${i === 0 || i === 6 ? "text-[var(--c-brand)]" : ""}`}
          >
            {w}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const { segs, levels } = layoutWeek(week[0], view.spans);
        const colTop = Array.from({ length: 7 }, (_, c) =>
          segs.reduce((m, s) => (c >= s.col && c < s.col + s.span ? Math.max(m, s.level + 1) : m), 0)
        );
        const cells = week.map((key, col) => {
          const d = view.days.get(key);
          const items: ReactNode[] = [];
          if (d) {
            if (d.status === "temp_closed") items.push(<span className={closedChip}>臨時休業</span>);
            if (d.status === "closed")
              items.push(<span className="pointer-events-none px-1 text-[9px] text-[var(--c-faint)] sm:text-[11px]">休業</span>);
            if (d.timeLabel) items.push(<span className={openChip}>{d.timeLabel}</span>);
            if (d.stay) items.push(<span className={stayNote}>{STAY_LABEL}</span>);
            d.events.forEach((ev) => {
              const c = EVENT_COLORS[ev.color];
              items.push(
                <span className={`${chipBase} font-semibold`} style={{ borderColor: c.line, backgroundColor: c.soft, color: c.text }}>
                  {ev.title}
                </span>
              );
            });
          }
          return { key, col, items, inMonth: key.startsWith(ym) };
        });
        const maxRow = Math.max(1, levels, ...cells.map((c) => colTop[c.col] + c.items.length));
        const wStart = week[0];

        return (
          <div key={wStart} className={wi > 0 ? "border-t border-[var(--c-border)]" : ""}>
            {/* 日付番号 */}
            <div className="grid grid-cols-7">
              {week.map((key, i) => {
                const inMonth = key.startsWith(ym);
                const dow = dayOfWeek(key);
                const isRed = dow === 0 || dow === 6 || !!view.days.get(key)?.holidayName;
                const isToday = key === today;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelect(key)}
                    className={`flex items-center px-1 pt-1 ${i > 0 ? "border-l border-[var(--c-border)]" : ""} ${
                      inMonth ? "" : "bg-[var(--c-outside)]"
                    }`}
                  >
                    <span
                      className={`grid h-6 min-w-6 place-items-center rounded-full text-[15px] font-bold tabular-nums sm:h-7 sm:text-lg ${
                        isToday
                          ? "bg-[var(--c-muted)] text-white"
                          : !inMonth
                            ? "text-[var(--c-faint)]"
                            : isRed
                              ? "text-[var(--c-brand)]"
                              : ""
                      }`}
                    >
                      {Number(key.slice(8, 10))}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 本文（帯＝連結バー / 単日の営業時間・イベント） */}
            <div className="grid grid-cols-7 pb-1 pt-0.5" style={{ gridTemplateRows: `repeat(${maxRow}, auto)` }}>
              {cells.map((c, i) => (
                <button
                  key={`${c.key}-bg`}
                  type="button"
                  aria-label={`${c.key} の詳細`}
                  onClick={() => onSelect(c.key)}
                  style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                  className={`min-h-[2.5rem] transition hover:bg-[var(--c-surface-2)] sm:min-h-[3.75rem] ${
                    i > 0 ? "border-l border-[var(--c-border)]" : ""
                  } ${c.inMonth ? "" : "bg-[var(--c-outside)]"}`}
                />
              ))}

              {segs.map((s) => {
                const c = s.event ? EVENT_COLORS[s.event.color] : null;
                return (
                  <div
                    key={s.id}
                    style={{
                      gridColumn: `${s.col + 1} / span ${s.span}`,
                      gridRow: s.level + 1,
                      ...(c ? { borderColor: c.line, backgroundColor: c.soft, color: c.text } : {}),
                    }}
                    className={`pointer-events-none flex items-center justify-between gap-1 self-start truncate border px-1 py-px text-[8px] leading-tight sm:px-1.5 sm:text-[13px] ${
                      c ? "font-semibold" : "border-[var(--c-open-line)] bg-[var(--c-open-soft)] font-medium text-[var(--c-open)]"
                    } ${s.continuesLeft ? "rounded-l-none border-l-0" : "rounded-l"} ${s.continuesRight ? "rounded-r-none border-r-0" : "rounded-r"}`}
                  >
                    {s.event ? (
                      <span className="truncate">{s.continuesLeft ? "" : s.event.title}</span>
                    ) : (
                      <>
                        <span className="truncate">{s.head}</span>
                        {s.tail && <span className="shrink-0">{s.tail}</span>}
                      </>
                    )}
                  </div>
                );
              })}

              {cells.map((c) =>
                c.items.map((node, i) => (
                  <div
                    key={`${c.key}-${i}`}
                    style={{ gridColumn: c.col + 1, gridRow: colTop[c.col] + i + 1 }}
                    className="pointer-events-none flex min-w-0 flex-col self-start"
                  >
                    {node}
                  </div>
                ))
              )}
            </div>

            {selected && selected >= wStart && selected <= week[6] && (
              <DayBubble dateKey={selected} col={diffDays(wStart, selected)} view={view} onClose={() => onSelect(selected)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** タップした日の詳細（当該週の直下に出す吹き出し。旧アプリと同じ） */
function DayBubble({ dateKey, col, view, onClose }: { dateKey: string; col: number; view: CalendarView; onClose: () => void }) {
  const d = view.days.get(dateKey);
  const dow = dayOfWeek(dateKey);
  const isRed = dow === 0 || dow === 6 || !!d?.holidayName;
  const band = view.spans.find((s) => s.kind === "business" && s.startKey <= dateKey && s.endKey >= dateKey);
  const spanEvents = view.spans.filter((s) => s.kind === "event" && s.startKey <= dateKey && s.endKey >= dateKey);

  let hours: string | null = null;
  if (band) {
    const first = band.startKey === dateKey;
    const last = band.endKey === dateKey;
    hours = first ? `${band.startLabel}〜 翌日まで通し` : last ? `前日から通し 〜${band.endLabel}` : "終日営業（通し）";
  } else if (d?.timeLabel) {
    hours = d.timeLabel;
  }
  const events = [...spanEvents.map((s) => s.event!), ...(d?.events ?? [])];
  const closed = d?.status === "temp_closed" ? "臨時休業" : d?.status === "closed" ? "休業" : null;

  return (
    <div className="relative border-t border-[var(--c-border)] bg-[var(--c-surface-2)] px-2 pb-2.5 pt-3">
      <div
        className="absolute top-[7px] z-10 h-3 w-3 rotate-45 border-l border-t border-[var(--c-border-strong)] bg-[var(--c-card)]"
        style={{ left: `calc(${col + 0.5} / 7 * 100% - 6px)` }}
      />
      <div className="relative rounded-xl border border-[var(--c-border-strong)] bg-[var(--c-card)] p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold tabular-nums" style={{ color: isRed ? "var(--c-brand)" : "var(--c-text)" }}>
              {Number(dateKey.slice(5, 7))}月{Number(dateKey.slice(8, 10))}日
            </span>
            <span className="text-xs font-medium" style={{ color: isRed ? "var(--c-brand)" : "var(--c-muted)" }}>
              （{WEEKDAYS[dow]}
              {d?.holidayName ? "・祝" : ""}）
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--c-muted)] hover:bg-[var(--c-surface-2)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <ul className="flex flex-col gap-1">
          {hours && (
            <li className="flex items-center gap-2 rounded-lg bg-[var(--c-open-soft)] px-2 py-1">
              <span className="text-sm font-bold tabular-nums text-[var(--c-open)]">{hours}</span>
              <span className="text-xs text-[var(--c-muted)]">営業</span>
            </li>
          )}
          {d?.stay && (
            <li className="px-2 py-1 text-xs font-semibold text-[var(--c-note)]">{STAY_LABEL}</li>
          )}
          {closed && (
            <li className="rounded-lg border border-[var(--c-brand)] bg-[var(--c-event-soft)] px-2 py-1 text-xs font-semibold text-[var(--c-brand)]">
              {closed}
            </li>
          )}
          {events.map((ev) => {
            const c = EVENT_COLORS[ev.color];
            return (
              <li key={ev.id} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ backgroundColor: c.soft, color: c.text }}>
                {ev.title}
              </li>
            );
          })}
        </ul>
        {!hours && !closed && events.length === 0 && <p className="text-xs text-[var(--c-muted)]">営業情報はありません</p>}
      </div>
    </div>
  );
}
