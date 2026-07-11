"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** Supabase 認証の英語エラーを日本語の分かりやすい案内に変換する */
function friendlyOtpError(message: string): string {
  const m = message.toLowerCase();
  // 例: "For security purposes, you can only request this after 31 seconds."
  const sec = /after (\d+) seconds/.exec(message);
  if (m.includes("after") && sec) {
    return `確認メールは連続して送信できません。約${sec[1]}秒お待ちいただいてから、もう一度お試しください。`;
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "確認メールの送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。";
  }
  return "確認メールの送信に失敗しました。しばらくしてから再度お試しください。（" + message + "）";
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    // 従業員として登録済みのメールアドレスのみ受け付ける
    const { data: registered } = await supabase.rpc("email_registered", {
      p_email: email,
    });
    if (!registered) {
      setError(
        "このメールアドレスは従業員として登録されていないか、すでに利用開始済みです。管理者にお問い合わせください。"
      );
      setLoading(false);
      return;
    }

    // パスワードなしのマジックリンクを送信(クリック後にパスワードを設定する)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${location.origin}/auth/callback?setup=1`,
      },
    });

    if (otpError) {
      setError(friendlyOtpError(otpError.message));
      setLoading(false);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-bold">確認メールを送信しました</h1>
          <p className="text-sm text-gray-600">
            {email} 宛てに確認メールを送りました。
            メール内のリンクをタップすると、パスワードの設定画面に進みます。
          </p>
          <p className="mt-4 text-xs text-gray-400">
            メールが届かない場合は、迷惑メールフォルダもご確認ください。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold">初回登録</h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          会社に届け出たメールアドレスを入力してください。
          確認メールのリンクからパスワードを設定します。
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "送信中..." : "確認メールを送る"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">
          登録済みの方は{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
