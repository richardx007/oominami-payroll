"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("メールアドレスまたはパスワードが正しくありません");
      setLoading(false);
      return;
    }

    // 操作ログ(ログイン)を記録。失敗しても無視する
    try {
      await supabase.rpc("log_activity", {
        p_action: "ログイン",
        p_detail: email,
      });
    } catch {}

    router.push("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    setError(null);
    setResetMessage(null);
    setResetLoading(true);
    const fd = new FormData();
    fd.set("email", email);
    const result = await requestPasswordReset(fd);
    setResetLoading(false);
    if (result.ok) {
      setResetMessage(result.message);
    } else {
      setError(result.message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold">給与管理システム</h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          ver.{process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev"}
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
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {resetMessage && (
            <p className="text-sm text-green-700">{resetMessage}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
            className="w-full text-center text-sm text-blue-600 hover:underline disabled:opacity-50"
          >
            {resetLoading ? "送信中..." : "パスワードを忘れたら"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">
          初めての方は{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            初回登録
          </Link>
        </p>
      </div>
    </main>
  );
}
