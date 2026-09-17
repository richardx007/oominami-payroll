"use client";

import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  buildCalendarView,
  dayOfWeek,
  EVENT_COLORS,
  layoutWeek,
  monthGridKeys,
  type BusinessDayRow,
  type CalendarEventRow,
  type EventTypeRow,
} from "@/lib/business-calendar-view";
import type { Season } from "./seasons";

/**
 * A4ポスターのカレンダー本体（旧 oominami-calendar の PosterCalendar.tsx を新しいデータに合わせて移植）。
 * スタイルは mm/pt の固定値。寸法の考え方はスキル `printable-calendar` §2・§3。
 */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 各値は実測に基づく（ヘッダー54mm・フッター14mm・main余白5mm 時）
const WEEKS_AREA_MM = 212.4; // 週グリッド全体の高さ
const DATE_LINE_MM = 10; // 各週の日付番号行の高さ（画像化時の字形はみ出しを見込む）
const BODY_TOP_MM = 1.2; // 日付とイベント枠の間隔
const ROW_GAP_MM = 0.8; // 段間の余白
const BOX_MAX_MM = 14;
const BOX_MIN_MM = 7;

// 日の区切り線（淡すぎると印刷で消えるため濃いめ）
const GRID_LINE = "0.35mm solid #b9bfc9";

/**
 * チップ/帯の共通スタイル。高さは行いっぱい（全イベントで統一）、文字は折り返し可（truncate は使わない）、
 * leading 1.25 と上下 padding で画像化時に字形の下が切れるのを防ぐ。
 */
const boxBase =
  "flex h-full w-full items-center justify-center overflow-hidden break-words px-[1.2mm] py-[0.6mm] text-center text-[10pt] font-bold leading-[1.25]";
const openBox = "border-[#4bb083] bg-[#e7f6ee] text-[#1b8f4d]";

// 営業時間は「折り返さない範囲でできるだけ大きく」。ラベルごとに1行に収まる最大サイズまで詰める
const FIT_MAX_PT = 13; // 日付(16pt)より控えめに
const FIT_MIN_PT = 8;
const FIT_STEP_PT = 0.25;

function fitTextSize(el: HTMLElement) {
  const range = document.createRange();
  // 1行に収まっているかは行ボックスの数で見る（箱が数行ぶん高いので高さでは検出できない）
  const fitsOnOneLine = () => {
    range.selectNodeContents(el);
    return range.getClientRects().length <= 1 && el.scrollWidth <= el.clientWidth + 1;
  };
  for (let pt = FIT_MAX_PT; pt >= FIT_MIN_PT; pt -= FIT_STEP_PT) {
    el.style.fontSize = `${pt}pt`;
    if (fitsOnOneLine()) return;
  }
  el.style.fontSize = `${FIT_MIN_PT}pt`;
}

export function PosterCalendar({
  ym,
  days,
  events,
  types,
  holidays,
  season,
}: {
  ym: string;
  days: BusinessDayRow[];
  events: CalendarEventRow[];
  types: EventTypeRow[];
  holidays: Record<string, string>;
  season: Season;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const view = useMemo(() => buildCalendarView(days, events, types), [days, events, types]);
  const keys = monthGridKeys(ym);
  const weeks: string[][] = [];
  for (let i = 0; i < keys.length; i += 7) weeks.push(keys.slice(i, i + 7));

  // 週ごとのレイアウトを先に確定し、ポスター全体で必要な最大段数を求める
  const layouts = weeks.map((week) => {
    const { segs, levels } = layoutWeek(week[0], view.spans);
    const colTop = Array.from({ length: 7 }, (_, c) =>
      segs.reduce((m, s) => (c >= s.col && c < s.col + s.span ? Math.max(m, s.level + 1) : m), 0)
    );
    const cells = week.map((key, col) => {
      const inMonth = key.startsWith(ym);
      const d = view.days.get(key);
      const items: { key: string; node: ReactNode }[] = [];
      if (d) {
        // 前月・翌月の日も営業時間／イベントを表示する（「休」は当月のみ）
        if (d.status === "temp_closed") {
          items.push({
            key: "tc",
            node: <span className={`${boxBase} rounded-[1.2mm] border-[0.35mm] border-[#d81f2a] bg-[#fbf1d9] text-[#d81f2a]`}>臨時休業</span>,
          });
        }
        if (d.status === "closed" && inMonth) {
          items.push({
            key: "cl",
            node: <span className="flex h-full w-full items-center justify-center text-[9pt] leading-[1.25] text-[#aab0ba]">休</span>,
          });
        }
        if (d.timeLabel) {
          items.push({
            key: "t",
            node: (
              <span data-fit className={`${boxBase} rounded-[1.2mm] border-[0.35mm] ${openBox}`}>
                {d.timeLabel}
              </span>
            ),
          });
        }
        if (d.stay) {
          items.push({
            key: "s",
            // 「泊まり可能」は営業時間の補足なので、枠を付けず濃いグレーの文字だけで出す
            node: <span className={`${boxBase} text-[#374151]`}>泊まり可能</span>,
          });
        }
        d.events.forEach((ev) => {
          const c = EVENT_COLORS[ev.color];
          items.push({
            key: `e-${ev.id}`,
            node: (
              <span
                className={`${boxBase} rounded-[1.2mm] border-[0.35mm]`}
                style={{ borderColor: c.line, backgroundColor: c.soft, color: c.text }}
              >
                {ev.title}
              </span>
            ),
          });
        });
      }
      const dow = dayOfWeek(key);
      const isRed = dow === 0 || dow === 6 || !!(d?.holidayName ?? holidays[key]);
      return { key, col, inMonth, isRed, items };
    });
    const rows = Math.max(1, levels, ...cells.map((c) => colTop[c.col] + c.items.length));
    return { week, segs, colTop, cells, rows };
  });

  // A4 に収まる範囲で最大 BOX_MAX_MM。全週で同じ高さに揃える
  const maxRows = Math.max(1, ...layouts.map((l) => l.rows));
  const availMm = WEEKS_AREA_MM / weeks.length - DATE_LINE_MM - BODY_TOP_MM;
  // 末尾に伸縮トラックを足しているので、行間は maxRows 個ぶん確保する
  const boxMm = Math.max(BOX_MIN_MM, Math.min(BOX_MAX_MM, (availMm - ROW_GAP_MM * maxRows) / maxRows));

  // 描画前に確定させたいので useLayoutEffect。画像化は計算済みスタイルを読むため PDF/画像にも反映される
  useLayoutEffect(() => {
    rootRef.current?.querySelectorAll<HTMLElement>("[data-fit]").forEach(fitTextSize);
  });

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[3mm] border-[0.6mm] border-[#aab0ba] bg-white"
    >
      {/* 曜日ヘッダー */}
      <div className="grid shrink-0 grid-cols-7 border-b-[0.6mm] border-[#aab0ba]" style={{ backgroundColor: season.weekdayBg }}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            // 画像化時に字形が下寄りになるため、下側を厚めにして罫線と重ならないようにする
            className="pb-[2.6mm] pt-[0.6mm] text-center text-[17pt] font-bold leading-[1.2]"
            style={{ color: i === 0 || i === 6 ? "#d81f2a" : "#33383f" }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 週 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {layouts.map((wk, wi) => (
          <div
            key={wk.week[0]}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ borderTop: wi > 0 ? GRID_LINE : undefined }}
          >
            {/* 日付番号 */}
            <div className="grid shrink-0 grid-cols-7">
              {wk.cells.map((c) => (
                <div
                  key={c.key}
                  className="flex items-baseline justify-center gap-[1.2mm] overflow-hidden px-[1.6mm] pb-[1.6mm] pt-[1mm]"
                  style={{ borderLeft: c.col > 0 ? GRID_LINE : undefined, background: c.inMonth ? "#fff" : "#eef0f4" }}
                >
                  <span
                    className="text-[16pt] font-bold leading-[1.3] tabular-nums"
                    style={{ color: !c.inMonth ? "#b6bcc6" : c.isRed ? "#d81f2a" : "#2a2f36" }}
                  >
                    {Number(c.key.slice(8, 10))}
                  </span>
                </div>
              ))}
            </div>

            {/* 本文（帯＝連結バー / 単日チップを同じ高さの行に配置） */}
            <div
              className="grid min-h-0 flex-1 grid-cols-7"
              style={{
                // 末尾に伸縮トラックを置き、縦の区切り線が週の最下部まで届くようにする
                gridTemplateRows: `repeat(${wk.rows}, ${boxMm}mm) 1fr`,
                rowGap: `${ROW_GAP_MM}mm`,
                paddingTop: `${BODY_TOP_MM}mm`,
              }}
            >
              {wk.cells.map((c) => (
                <div
                  key={`${c.key}-bg`}
                  style={{
                    gridColumn: c.col + 1,
                    gridRow: "1 / -1",
                    borderLeft: c.col > 0 ? GRID_LINE : undefined,
                    background: c.inMonth ? undefined : "#eef0f4",
                  }}
                />
              ))}

              {wk.segs.map((seg) => {
                const business = seg.kind === "business";
                const c = seg.event ? EVENT_COLORS[seg.event.color] : null;
                const label = business ? [seg.head, seg.tail].filter(Boolean).join(" ") : seg.event!.title;
                return (
                  <div
                    key={seg.id}
                    style={{ gridColumn: `${seg.col + 1} / span ${seg.span}`, gridRow: seg.level + 1 }}
                    className="min-w-0 px-[0.6mm]"
                  >
                    <span
                      {...(business ? { "data-fit": "" } : {})}
                      className={`${boxBase} border-[0.35mm] ${business ? openBox : ""} ${
                        seg.continuesLeft ? "rounded-l-none border-l-0" : "rounded-l-[1.2mm]"
                      } ${seg.continuesRight ? "rounded-r-none border-r-0" : "rounded-r-[1.2mm]"}`}
                      style={c ? { borderColor: c.line, backgroundColor: c.soft, color: c.text } : undefined}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}

              {wk.cells.map((c) =>
                c.items.map((it, i) => (
                  <div
                    key={`${c.key}-${it.key}`}
                    style={{ gridColumn: c.col + 1, gridRow: wk.colTop[c.col] + i + 1 }}
                    className="min-w-0 px-[1.4mm]"
                  >
                    {it.node}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
