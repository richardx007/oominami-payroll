"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(
        "セッションが確認できません。お手数ですが、確認メールのリンクをもう一度開いてください。"
      );
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      // 「以前と同じパスワード」は許容する(過去パスワードとの一致チェックは不要)。
      // Supabase(GoTrue)は同一パスワードだと same_password エラーを返すため、
      // その場合は設定成功と同等に扱ってそのまま進める。
      const isSamePassword =
        (updateError as { code?: string }).code === "same_password" ||
        /different from the old password/i.test(updateError.message);
      if (!isSamePassword) {
        setError("設定に失敗しました: " + updateError.message);
        setLoading(false);
        return;
      }
    }

    // 操作ログ(パスワード設定)を記録。失敗しても無視する
    try {
      await supabase.rpc("log_activity", { p_action: "パスワード設定" });
    } catch {}

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold">パスワードの設定</h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          次回からのログインに使うパスワードを設定してください
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              パスワード(8文字以上)
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
              パスワード(確認)
            </label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "設定中..." : "設定して始める"}
          </button>
        </form>
      </div>
    </main>
  );
}
