import { createClient } from "@/lib/supabase/server";

/**
 * 操作ログを記録する(ベストエフォート)。
 * 記録に失敗しても本処理に影響しないよう、例外は握りつぶす。
 * actor は DB 関数側で auth.uid() から解決される(未ログインは「(未ログイン)」)。
 */
export async function logActivity(
  action: string,
  detail?: string
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_activity", {
      p_action: action,
      p_detail: detail ?? null,
    });
  } catch {
    // ログ記録の失敗は無視する
  }
}
