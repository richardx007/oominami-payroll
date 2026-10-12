import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import {
  addDaysKey,
  addMonthsYm,
  footnoteOf,
  jstTodayKey,
  monthGridKeys,
  type BusinessDayRow,
  type CalendarEventRow,
  type EventTypeRow,
  type MonthFootnote,
} from "@/lib/business-calendar-view";
import { PosterView } from "@/app/admin/calendar/poster/ui";

/**
 * 営業カレンダー(従業員の「その他」メニュー)。2026-10-12 から、ホームページ埋め込み(/calendar/embed)を
 * 別タブで開くのをやめ、管理者と同じ A4 ポスター画面(PDF・画像で出せる)を出す(オーナー依頼)。
 * 従業員は business_days などを直接読めない(RLS は管理者のみ)ため、ホームページと同じ
 * public_business_calendar()(公開中の翌月まで・公開イベントだけ)から読む。祝日名は営業日の行の holiday_name。
 */
export default async function EmployeeCalendarPosterPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  await requireEmployee();
  const thisYm = jstTodayKey().slice(0, 7);
  const maxYm = addMonthsYm(thisYm, 1);
  const { ym: ymParam } = await searchParams;
  const asked = ymParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(ymParam) ? ymParam : thisYm;
  const ym = asked > maxYm ? maxYm : asked;

  const grid = monthGridKeys(ym);
  const from = addDaysKey(grid[0], -14);
  const to = addDaysKey(grid[grid.length - 1], 14);

  const supabase = await createClient();
  const { data } = await supabase.rpc("public_business_calendar", { p_from: from, p_to: to });
  const cal = (data ?? {}) as {
    days?: BusinessDayRow[];
    events?: CalendarEventRow[];
    types?: EventTypeRow[];
    notes?: MonthFootnote[];
  };
  const days = cal.days ?? [];
  const notes = (cal.notes ?? []).map((n) => ({ ...n, ym: String(n.ym).slice(0, 7) }));

  return (
    <PosterView
      ym={ym}
      days={days}
      events={cal.events ?? []}
      types={cal.types ?? []}
      holidays={Object.fromEntries(days.filter((d) => d.holiday_name).map((d) => [d.date, d.holiday_name!]))}
      footnote={footnoteOf(notes, ym)?.trim() || null}
      basePath="/business-calendar"
      maxYm={maxYm}
    />
  );
}
