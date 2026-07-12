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

  // 空欄のときは形式エラーを出さず、案内のみ返す(ノンチェック運用)
  if (!email) {
    return { ok: true, message: NEUTRAL_MESSAGE };
  }

  try {
    const supabase = await createClient({ flowType: "implicit" });
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const redirectTo = `https://${host}/auth/callback?setup=1`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    // 送信レート超過など実際の送信失敗は画面に出して原因を切り分けられるようにする。
    // 登録の有無では成否が変わらないため、アカウント列挙にはつながらない。
    if (error) {
      const rate = /rate|too many|429/i.test(error.message);
      return {
        ok: false,
        message: rate
          ? "短時間に送信しすぎたため、しばらく(数十分)おいてから再度お試しください。"
          : "メールの送信に失敗しました: " + error.message,
      };
    }
  } catch (e) {
    return {
      ok: false,
      message:
        "メールの送信に失敗しました: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }

  return { ok: true, message: NEUTRAL_MESSAGE };
}
