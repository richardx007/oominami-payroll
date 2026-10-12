"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDaysKey, jstTodayKey, type BusinessDayRow, type CalendarEventRow } from "@/lib/business-calendar-view";
import { reportEmbedHeight, TODAY_HEIGHT_MESSAGE } from "@/lib/embed-height";
import { buildTodayBusiness, todayHoursText, type TodayBusiness } from "@/lib/today-business";

// ホームページの背景が黒いため、明るい色で出す（2026-10-12、オーナー依頼）。
// 赤の代わりにピンク、緑は明るめ。土日祝以外の日付は白
const PINK = "#ff7eb6";
const OPEN = "#4ade80";
const EVENT = "#fcd34d";
const TEXT = "#ffffff";

export function EmbedToday() {
  const [today, setToday] = useState<TodayBusiness | null>(null);
  const [failed, setFailed] = useState(false);

  // 中身の高さを埋め込み元へ知らせる（HPで内側のスクロールバーを出さないため）
  useEffect(() => reportEmbedHeight(TODAY_HEIGHT_MESSAGE), []);

  useEffect(() => {
    const key = jstTodayKey();
    createClient()
      .rpc("public_business_calendar", { p_from: addDaysKey(key, -1), p_to: key })
      .then(({ data, error }) => {
        if (error || !data) {
          setFailed(true);
          return;
        }
        const d = data as { days: BusinessDayRow[]; events: CalendarEventRow[] };
        setToday(buildTodayBusiness(d.days, d.events, key));
      });
  }, []);

  if (failed) return null;
  if (!today) return <div style={{ minHeight: 64 }} />;

  const open = today.status === "open";
  return (
    <div
      style={{ color: TEXT, fontFamily: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif' }}
      className="space-y-1 px-2 py-2 text-xl leading-snug sm:text-2xl"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded px-2 py-0.5 text-base font-bold text-white sm:text-lg" style={{ background: PINK }}>
          本日の営業
        </span>
        <span className="font-bold tabular-nums" style={{ color: today.red ? PINK : TEXT }}>
          {today.dateLabel}
        </span>
        <span className="font-bold tabular-nums" style={{ color: open ? OPEN : PINK }}>
          {open ? `営業時間 ${todayHoursText(today)}` : todayHoursText(today)}
        </span>
      </div>
      {/* イベントは2行目 */}
      {today.events.length > 0 && (
        <div className="font-bold" style={{ color: EVENT }}>
          {today.events.join("／")}
        </div>
      )}
    </div>
  );
}
