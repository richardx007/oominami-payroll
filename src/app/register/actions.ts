"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/log";

export type ActionResult = { ok: boolean; message: string };

/** Supabase 認証の英語エラーを日本語の分かりやすい案内に変換する */
function friendlyOtpError(message: string): string {
  const m = message.toLowerCase();
  const sec = /after (\d+) seconds/.exec(message);
  if (m.includes("after") && sec) {
    return `確認メールは連続して送信できません。約${sec[1]}秒お待ちいただいてから、もう一度お試しください。`;
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "確認メールの送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。";
  }
  return "確認メールの送信に失敗しました。しばらくしてから再度お試しください。（" + message + "）";
}

/**
 * 初回登録の確認メール(マジックリンク)を送信する。
 * 本人はメールを別端末(スマホのメールアプリ内ブラウザ等)で開くため、PKCE では
 * code_verifier がその端末に無く /auth/callback の検証が失敗する。送信は implicit
 * フローのクライアントで行い、端末非依存の token_hash を発行させる
 * (Supabase の Magic Link テンプレートは {{ .TokenHash }} リンクである必要がある)。
 */
export async function sendRegisterLink(
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    return { ok: false, message: "メールアドレスを入力してください。" };
  }

  const supabase = await createClient({ flowType: "implicit" });

  // 従業員として登録済み(かつ未利用)のメールアドレスのみ受け付ける
  const { data: registered } = await supabase.rpc("email_registered", {
    p_email: email,
  });
  if (!registered) {
    return {
      ok: false,
      message:
        "このメールアドレスは従業員として登録されていないか、すでに利用開始済みです。管理者にお問い合わせください。",
    };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const emailRedirectTo = `https://${host}/auth/callback?setup=1`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo },
  });

  if (error) {
    return { ok: false, message: friendlyOtpError(error.message) };
  }

  await logActivity("メール送信", `初回登録の確認メール: ${email}`);
  return { ok: true, message: "" };
}
