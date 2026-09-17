"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { addMonthsYm } from "@/lib/business-calendar-view";
import { PublicCalendar, type CalendarData } from "@/components/business-calendar/PublicCalendar";
import { loadPreviewCalendar } from "./actions";

export function EmbedCalendar({ preview }: { preview: boolean }) {
  const loader = useCallback(
    async (from: string, to: string): Promise<CalendarData> => {
      if (preview) return loadPreviewCalendar(from, to);
      const { data, error } = await createClient().rpc("public_business_calendar", { p_from: from, p_to: to });
      if (error || !data) throw error ?? new Error("no data");
      return data as CalendarData;
    },
    [preview]
  );

  return (
    <PublicCalendar
      loader={loader}
      // HPは今月＋翌月まで。プレビューは準備中の月（翌々月）まで進める
      maxYm={(cur) => addMonthsYm(cur, preview ? 2 : 1)}
    />
  );
}
