"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDaysKey, jstTodayKey, type BusinessDayRow, type CalendarEventRow } from "@/lib/business-calendar-view";
import { reportEmbedHeight, TODAY_HEIGHT_MESSAGE } from "@/lib/embed-height";
import { buildTodayBusiness, todayHoursText, type TodayBusiness } from "@/lib/today-business";

// 営業カレンダーの埋め込み（PublicCalendar）と同じ色
const BRAND = "#d81f2a";
const OPEN = "#1f9d55";
const EVENT = "#b8860b";
const TEXT = "#1f2328";

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
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 py-2 sm:text-lg"
    >
      <span className="rounded px-2 py-0.5 text-sm font-bold text-white" style={{ background: BRAND }}>
        本日の営業
      </span>
      <span className="font-bold tabular-nums" style={{ color: today.red ? BRAND : TEXT }}>
        {today.dateLabel}
      </span>
      <span className="font-bold tabular-nums" style={{ color: open ? OPEN : BRAND }}>
        {open ? `営業時間 ${todayHoursText(today)}` : todayHoursText(today)}
      </span>
      {today.events.length > 0 && (
        <span className="font-bold" style={{ color: EVENT }}>
          {today.events.join("／")}
        </span>
      )}
    </div>
  );
}
