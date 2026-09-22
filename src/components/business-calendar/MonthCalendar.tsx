"use client";

import { useMemo, type ReactNode } from "react";
import {
  buildCalendarView,
  dayOfWeek,
  EVENT_COLORS,
  layoutWeek,
  monthGridKeys,
  STAY_LABEL,
  weekdayHeaderBg,
  type BusinessDayRow,
  type CalendarEventRow,
  type EventTypeRow,
  type EventView,
} from "@/lib/business-calendar-view";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const chip =
  "block w-full truncate rounded-sm border px-0.5 text-[9px] leading-tight sm:px-1 sm:text-[11px]";
const openChip = `${chip} border-green-500 bg-green-50 font-medium text-green-800`;
// 「泊まり可」は営業時間の補足なので、枠を付けず濃いグレーの文字だけで出す
const stayNote =
  "block w-full truncate px-0.5 text-[9px] font-semibold leading-tight text-gray-700 sm:px-1 sm:text-[11px]";

// イベント枠は隣の日の枠と区切りが見えるよう、左右を少し詰める（外側の mx-px と合わせて片側2px）
const eventChip = chip.replace("w-full", "mx-px");

function EventChip({ ev }: { ev: EventView }) {
  const c = EVENT_COLORS[ev.color];
  return (
    <span
      className={`${eventChip} font-semibold`}
      style={{ borderColor: c.line, backgroundColor: c.soft, color: c.text }}
      title={`${ev.typeName}: ${ev.title}`}
    >
      {ev.title}
    </span>
  );
}

/**
 * 営業カレンダーの月表示（管理画面・プレビュー・HP埋め込みで共用）。
 * 通し営業は週内で連結した帯、単日は時刻チップ、臨時休業は赤チップ、イベントは種類の色。
 * days には前後の月の行も含めて渡すこと（月をまたぐ帯の始まり・終わりを正しく出すため）。
 */
export function MonthCalendar({
  ym,
  days,
  events,
  types,
  holidays = {},
  today,
  selected,
  onSelect,
  showManual = false,
  blank = false,
  attach,
}: {
  ym: string;
  days: BusinessDayRow[];
  events: CalendarEventRow[];
  types: EventTypeRow[];
  /** 行の無い日（未作成の月）も祝日を赤くするため */
  holidays?: Record<string, string>;
  today?: string;
  selected?: string | null;
  onSelect?: (date: string) => void;
  /** 手で変更した日に●を付ける（管理画面） */
  showManual?: boolean;
  /** スワイプで月を移動中は中身を出さない */
  blank?: boolean;
  attach?: (el: HTMLDivElement | null) => void;
}) {
  const view = useMemo(() => buildCalendarView(days, events, types), [days, events, types]);
  const keys = useMemo(() => monthGridKeys(ym), [ym]);
  const weeks: string[][] = [];
  for (let i = 0; i < keys.length; i += 7) weeks.push(keys.slice(i, i + 7));

  return (
    <div ref={attach} className="rounded-xl border-2 border-gray-400 bg-white p-0.5 sm:p-2">
      {/* 曜日の行は公開カレンダーと同じ月ごとの巡回色 */}
      <div
        className="mb-0.5 grid grid-cols-7 rounded-lg text-center text-base font-bold text-gray-700 sm:mb-1 sm:text-lg"
        style={{ backgroundColor: weekdayHeaderBg(ym) }}
      >
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}>
            {w}
          </div>
        ))}
      </div>

      {weeks.map((week) => {
        const { segs, levels } = blank ? { segs: [], levels: 0 } : layoutWeek(week[0], view.spans);
        // 各列で帯が使っている段数（その下からチップを並べる）
        const colTop = Array.from({ length: 7 }, (_, c) =>
          segs.reduce((m, s) => (c >= s.col && c < s.col + s.span ? Math.max(m, s.level + 1) : m), 0)
        );
        const cells = week.map((key, col) => {
          const d = blank ? undefined : view.days.get(key);
          const items: ReactNode[] = [];
          if (d) {
            if (d.status === "temp_closed") {
              items.push(
                <span key="tc" className={`${chip} border-red-500 bg-red-50 font-bold text-red-600`}>
                  臨時休業
                </span>
              );
            } else if (d.status === "closed") {
              items.push(
                <span key="cl" className="block px-0.5 text-[9px] leading-tight text-gray-400 sm:text-[11px]">
                  定休
                </span>
              );
            }
            if (d.timeLabel) {
              items.push(
                <span key="t" className={openChip}>
                  {d.timeLabel}
                </span>
              );
            }
            if (d.stay) {
              items.push(
                <span key="s" className={stayNote}>
                  {STAY_LABEL}
                </span>
              );
            }
            d.events.forEach((ev) => items.push(<EventChip key={ev.id} ev={ev} />));
          }
          return { key, col, d, items };
        });
        const rows = Math.max(1, levels, ...cells.map((c) => colTop[c.col] + c.items.length));

        return (
          <div key={week[0]} className="border-t border-gray-100 first:border-t-0">
            <div
              className="grid grid-cols-7"
              style={{ gridTemplateRows: `auto repeat(${rows}, auto) 1fr` }}
            >
              {/* 背景セル（タップ領域・枠線・選択/今日） */}
              {week.map((key, col) => {
                const inMonth = key.startsWith(ym);
                const isSelected = selected === key;
                const isToday = key === today;
                const d = view.days.get(key);
                const holidayName = d?.holidayName ?? holidays[key];
                const dow = dayOfWeek(key);
                const textColor = !inMonth
                  ? "text-gray-300"
                  : holidayName || dow === 0
                    ? "text-red-500"
                    : dow === 6
                      ? "text-blue-500"
                      : "text-gray-700";
                const Tag = onSelect ? "button" : "div";
                return [
                  <Tag
                    key={key}
                    {...(onSelect
                      ? { type: "button" as const, onClick: () => onSelect(key), "aria-label": `${key} を選ぶ` }
                      : {})}
                    title={holidayName ?? undefined}
                    style={{ gridColumn: col + 1, gridRow: "1 / -1" }}
                    className={`relative min-h-16 border border-gray-100 p-0 transition sm:min-h-20 ${
                      isSelected
                        ? ""
                        : isToday
                          ? "bg-gray-100"
                          : inMonth
                            ? onSelect
                              ? "hover:bg-gray-50"
                              : ""
                            : "bg-gray-50"
                    }`}
                  />,
                  // 選択の枠は帯・チップより手前に描く（帯の下に隠れて途切れないように）
                  isSelected && (
                    <div
                      key={`${key}-sel`}
                      style={{ gridColumn: col + 1, gridRow: "1 / -1" }}
                      className="pointer-events-none z-20 ring-2 ring-inset ring-blue-500"
                    />
                  ),
                  <div
                    key={`${key}-n`}
                    style={{ gridColumn: col + 1, gridRow: 1 }}
                    className="pointer-events-none z-[11] text-center"
                  >
                    <span className={`inline-flex items-center gap-0.5 text-base font-bold sm:text-lg ${textColor}`}>
                      {Number(key.slice(8, 10))}
                      {showManual && !blank && d?.manual && (
                        <span className="text-[10px] leading-none text-orange-500" aria-label="手で変更した日">
                          ●
                        </span>
                      )}
                    </span>
                  </div>,
                ];
              })}

              {/* 帯（通し営業・複数日イベント） */}
              {segs.map((s) => {
                const c = s.event ? EVENT_COLORS[s.event.color] : null;
                return (
                  <div
                    key={s.id}
                    style={{
                      gridColumn: `${s.col + 1} / span ${s.span}`,
                      gridRow: s.level + 2,
                      ...(c ? { borderColor: c.line, backgroundColor: c.soft, color: c.text } : {}),
                    }}
                    className={`pointer-events-none z-[11] flex items-center justify-between gap-1 self-start overflow-hidden border px-0.5 text-[9px] leading-tight sm:px-1 sm:text-[11px] ${
                      c ? "font-semibold" : "border-green-500 bg-green-50 font-medium text-green-800"
                    } ${s.continuesLeft ? "-ml-px rounded-l-none border-l-0" : `${c ? "ml-0.5" : "ml-px"} rounded-l-sm`} ${
                      s.continuesRight ? "-mr-px rounded-r-none border-r-0" : `${c ? "mr-0.5" : "mr-px"} rounded-r-sm`
                    }`}
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

              {/* 各日のチップ */}
              {cells.map((c) =>
                c.items.map((node, i) => (
                  <div
                    key={`${c.key}-${i}`}
                    style={{ gridColumn: c.col + 1, gridRow: colTop[c.col] + i + 2 }}
                    className="pointer-events-none z-[11] mx-px min-w-0 self-start"
                  >
                    {node}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 凡例（営業時間＋イベントの種類ごとの色）。
 * 印は■。●は「手で変更した日」のマークに使っているので重ねない。 */
export function CalendarLegend({ types }: { types: EventTypeRow[] }) {
  const sorted = [...types].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-green-600" />
        営業時間
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
        臨時休業
      </span>
      {sorted.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EVENT_COLORS[t.color].line }} />
          {t.name}
        </span>
      ))}
    </div>
  );
}
