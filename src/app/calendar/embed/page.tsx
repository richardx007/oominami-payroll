import type { Metadata } from "next";
import { EmbedCalendar } from "./ui";

export const metadata: Metadata = {
  title: "営業カレンダー",
  robots: { index: false },
};

/**
 * ホームページに iframe で埋め込む営業カレンダー（ログイン不要）。
 * データはブラウザから Supabase の public_business_calendar()（anon）を直接呼ぶ
 * （HPの閲覧で Worker の処理を増やさないため）。今月＋翌月まで表示する。
 * ?preview=1 は管理画面のプレビュー用で、準備中の月も表示する（管理者のみ）。
 */
export default async function CalendarEmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  return (
    <>
      {/* 埋め込み先の背景に馴染ませる（ルートレイアウトの背景色を打ち消す） */}
      <style>{`html,body{background:transparent!important;min-height:0!important}`}</style>
      <EmbedCalendar preview={preview === "1"} />
    </>
  );
}
