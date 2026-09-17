import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

/**
 * ログイン中の本人のシフト購読URL(https)を返す。未発行なら発行する。
 * 取得に失敗した場合は null(アカウント画面の他の項目は表示を続けられるように)。
 */
export async function getMyCalendarFeedUrl(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_calendar_token", { p_rotate: false });
  if (error || typeof data !== "string") return null;
  return `${getSiteUrl()}/api/ics/${data}.ics`;
}
