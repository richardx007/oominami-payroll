import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const setup = searchParams.get("setup");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // メール確認完了後、employees 行に auth ユーザーを紐付け
      await supabase.rpc("link_employee_account");
      // 初回登録フロー(マジックリンク)ならパスワード設定画面へ
      if (setup === "1") {
        return NextResponse.redirect(`${origin}/set-password`);
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
