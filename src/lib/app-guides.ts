/**
 * アプリの解説（操作説明の動画・資料へのリンク）。テーブル app_guides。
 * 登録は設定画面（admin/settings/guides.tsx）、表示は /admin/guides（管理者）と /guides（従業員）。
 */

export type AppGuide = {
  id: string;
  title: string;
  url: string;
  summary: string;
  for_admin: boolean;
  for_employee: boolean;
  sort_order: number;
};

export const APP_GUIDE_COLUMNS = "id, title, url, summary, for_admin, for_employee, sort_order";

export const GUIDE_TITLE_MAX = 60;
export const GUIDE_SUMMARY_MAX = 400;

/** 公開対象の表示（"管理者・従業員" など） */
export function audienceLabel(g: Pick<AppGuide, "for_admin" | "for_employee">): string {
  return [g.for_admin && "管理者", g.for_employee && "従業員"].filter(Boolean).join("・");
}

/** リンク先の種類（一覧のアイコン・ボタン表記用）。Google ドライブの動画かどうかは URL だけでは分からないため、ドライブ／その他で分ける */
export function linkKind(url: string): "drive" | "youtube" | "web" {
  try {
    const host = new URL(url).hostname;
    if (host === "drive.google.com" || host === "docs.google.com") return "drive";
    if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  } catch {
    // 不正な URL は保存時に弾いているので通常ここには来ない
  }
  return "web";
}
