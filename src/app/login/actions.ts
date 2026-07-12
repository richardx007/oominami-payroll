"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const NEUTRAL_MESSAGE =
  "パスワード再設定メールを送信しました。メールのリンクから再設定してください(届かない場合は迷惑メールもご確認ください)。";

/**
 * ログイン画面から本人がパスワード再設定メールを申請する(未ログインで実行可)。
 * 管理者の resetEmployeePassword と同じく token_hash 方式のリンクを送るため、
 * リンク先は /auth/callback?setup=1 → /set-password となる。
 * バリデーションや登録有無での分岐はせず、常に同じ案内メッセージを返す
 * (アカウント列挙対策 + 入力形式エラーを画面に出さないため)。
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  // 空欄など明らかに送れない場合も、エラーは出さず案内のみ返す
  if (email) {
    try {
      const supabase = await createClient({ flowType: "implicit" });
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
      const redirectTo = `https://${host}/auth/callback?setup=1`;
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch {
      // 送信可否は結果メッセージで区別しない
    }
  }

  return { ok: true, message: NEUTRAL_MESSAGE };
}
