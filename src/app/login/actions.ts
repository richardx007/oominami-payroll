"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const emailSchema = z.email("メールアドレスの形式が正しくありません");

/**
 * ログイン画面から本人がパスワード再設定メールを申請する(未ログインで実行可)。
 * 管理者の resetEmployeePassword と同じく token_hash 方式のリンクを送るため、
 * リンク先は /auth/callback?setup=1 → /set-password となる。
 * メールアドレスの登録有無は結果メッセージで区別しない(アカウント列挙対策)。
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const email = parsed.data.toLowerCase();

  const supabase = await createClient();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const redirectTo = `https://${host}/auth/callback?setup=1`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return {
      ok: false,
      message: "再設定メールの送信に失敗しました。時間をおいて再度お試しください。",
    };
  }

  return {
    ok: true,
    message:
      "パスワード再設定メールを送信しました。メールのリンクから再設定してください(届かない場合は迷惑メールもご確認ください)。",
  };
}
