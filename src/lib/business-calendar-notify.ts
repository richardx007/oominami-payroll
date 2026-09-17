import { addMonthsYm, draftDeadline } from "./business-calendar-view";

/** DB関数 create_business_month_if_due() から届く通知の種類 */
export type BusinessCalendarNotifyKind = "created" | "failed";

export type PushMessage = { title: string; body: string; tag: string; url: string };

function md(key: string): string {
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
}

/**
 * 営業カレンダーの自動作成通知の文面。
 * 締切・公開日は作成日（15日以降）ではなく対象月から決まる（例: 11月分 → 9月30日まで、10月1日から公開）。
 */
export function buildBusinessCalendarMessage(kind: BusinessCalendarNotifyKind, ym: string): PushMessage {
  const month = Number(ym.slice(5, 7));
  const url = `/admin/calendar?ym=${ym}`;
  if (kind === "failed") {
    return {
      title: "営業カレンダーを作成できませんでした",
      body: `祝日データを取得できていないため、${month}月分の自動作成を中止しました。明日また自動で試します。`,
      tag: `business-calendar-${ym}`,
      url,
    };
  }
  // 今日の日付に依存しないよう、締切の計算には対象月の2ヶ月前（作成月）の1日を渡す
  const { publishFrom, deadline } = draftDeadline(ym, `${addMonthsYm(ym, -2)}-01`);
  return {
    title: `${month}月の営業カレンダーを作成しました`,
    body: `${md(deadline)}までに、臨時休業・営業時間の変更・イベントを設定してください。${md(publishFrom)}からホームページに表示されます。`,
    tag: `business-calendar-${ym}`,
    url,
  };
}
