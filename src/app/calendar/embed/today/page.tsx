import type { Metadata } from "next";
import { EmbedToday } from "./ui";

export const metadata: Metadata = {
  title: "本日の営業",
  robots: { index: false },
};

/**
 * ホームページのトップに iframe で埋め込む「本日の営業」（ログイン不要）。
 * 営業カレンダーの埋め込み（/calendar/embed）と同じく、データはブラウザから
 * public_business_calendar()（anon）を直接呼ぶ。文言の組み立ては lib/today-business.ts。
 * 埋め込みコードは管理画面「ホームページ」（/admin/calendar/preview）に出す。
 */
export default function TodayEmbedPage() {
  return (
    <>
      {/* 埋め込み先の背景に馴染ませる（ルートレイアウトの背景色を打ち消す） */}
      <style>{`html,body{background:transparent!important;min-height:0!important}`}</style>
      <EmbedToday />
    </>
  );
}
