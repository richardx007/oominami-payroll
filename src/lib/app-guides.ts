/**
 * アプリの解説（操作説明の動画・資料へのリンク）。テーブル app_guides。
 * 登録は設定画面（admin/settings/guides.tsx）、一覧は /admin/guides（管理者）と /guides（従業員）、
 * アプリに保存した動画の再生は /watch/[id]（画面いっぱいのプレイヤー）。
 *
 * 各項目は「URL（外部の資料・動画へのリンク）」か「動画（非公開バケット app-guides に保存）」のどちらか。
 * Google ドライブの動画はスマホで小さくしか表示できず、ログインしていないと再生できないことがあるため、
 * 動画はアプリに保存する方を勧める（2026-09-26）。
 */

export type AppGuide = {
  id: string;
  title: string;
  url: string | null;
  video_path: string | null;
  video_size: number | null;
  /** 動画ファイルの作成日時（ISO）。登録時に動画から自動で読む（lib/mp4-meta.ts）。設定画面の一覧の2行目に出す */
  video_created_at: string | null;
  /** 最後に保存した日時（URL の項目は一覧の2行目に「更新日時」として出す） */
  updated_at: string;
  summary: string;
  for_admin: boolean;
  for_employee: boolean;
  sort_order: number;
};

export const APP_GUIDE_COLUMNS =
  "id, title, url, video_path, video_size, video_created_at, summary, for_admin, for_employee, sort_order, updated_at";

export const GUIDE_TITLE_MAX = 60;
export const GUIDE_SUMMARY_MAX = 400;

/** 動画を保存する Storage バケット（非公開。マイグレーション 20260926010000_app_guide_videos.sql） */
export const GUIDE_VIDEO_BUCKET = "app-guides";
/** 1ファイルの上限（バケットの file_size_limit と同じ。Supabase 無料プランの上限も 50MB） */
export const GUIDE_VIDEO_MAX = 50 * 1024 * 1024;
export const GUIDE_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
/** Supabase 無料プランのファイル保存容量（設定画面に使用量の目安として出す） */
export const STORAGE_FREE_BYTES = 1024 * 1024 * 1024;
/** 保存パス: ランダムなID＋拡張子（ファイル名に日本語が入ると Storage のキーとして扱いにくいため） */
export const GUIDE_VIDEO_PATH_RE = /^[0-9a-f-]{36}\.(mp4|mov)$/;

/** 公開対象の表示（"管理者・従業員" など） */
export function audienceLabel(g: Pick<AppGuide, "for_admin" | "for_employee">): string {
  return [g.for_admin && "管理者", g.for_employee && "従業員"].filter(Boolean).join("・");
}

/** "15.2MB" / "820KB" */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
}

/** リンク先の種類（一覧のボタン表記用） */
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

/** "2026/9/26 15:20"（日本時間） */
export function formatJstDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
