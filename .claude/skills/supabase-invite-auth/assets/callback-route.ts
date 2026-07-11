import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const setup = searchParams.get("setup");

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    // パスワード再設定(管理者発行)などの token_hash 方式。code_verifier 不要。
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    ok = !error;
  } else if (code) {
    // 初回登録(本人のブラウザで発行したマジックリンク)の PKCE 方式。
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    // メール確認完了後、employees 行に auth ユーザーを紐付け
    await supabase.rpc("link_employee_account");
    // 初回登録・再設定フローならパスワード設定画面へ
    if (setup === "1" || type === "recovery") {
      return NextResponse.redirect(`${origin}/set-password`);
    }
    return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
