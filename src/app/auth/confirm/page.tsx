"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * 認証リンク(初回登録・パスワード再設定)の確認ページ。
 *
 * /auth/callback で即座に verifyOtp/exchangeCodeForSession を実行すると、
 * メールセキュリティスキャナー等がリンクを自動で先読み(プリフェッチ)した際に
 * 1回しか使えないトークンを消費してしまい、本人が実際にクリックした時には
 * 既に無効という不具合が起きる(Supabase監査ログで実際に確認: 同じトークンへの
 * verify が数分内に2回発生し、2回目が "One-time token not found" で失敗)。
 *
 * このページはボタン押下という「人の操作」を挟んでからトークンを消費するため、
 * 自動プリフェッチでは実行されず、本人のクリックだけが有効な検証として扱われる。
 */
function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const setup = params.get("setup");

  async function handleContinue() {
    setState("loading");
    setError(null);
    const supabase = createClient();

    let ok = false;
    if (tokenHash && type) {
      const { error: err } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      ok = !err;
      if (err) setError(err.message);
    } else if (code) {
      const { error: err } = await supabase.auth.exchangeCodeForSession(code);
      ok = !err;
      if (err) setError(err.message);
    } else {
      setError("リンクの情報が不足しています。もう一度メールのリンクを開いてください。");
    }

    if (!ok) {
      setState("error");
      return;
    }

    await supabase.rpc("link_employee_account");

    if (setup === "1" || type === "recovery") {
      router.push("/set-password");
    } else {
      router.push("/");
    }
    router.refresh();
  }

  const hasToken = !!((tokenHash && type) || code);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-2xl font-bold">
          {type === "recovery" ? "パスワード再設定" : "初回登録"}
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          下のボタンを押して手続きを続けてください。
        </p>

        {state === "error" && (
          <p className="mb-4 text-sm text-red-600">
            リンクが無効か、有効期限が切れています。
            {error ? `(${error})` : ""}
            お手数ですが、再度メールの送信操作からやり直してください。
          </p>
        )}

        {hasToken ? (
          <button
            onClick={handleContinue}
            disabled={state === "loading"}
            className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {state === "loading" ? "確認中..." : "続ける"}
          </button>
        ) : (
          <p className="text-sm text-red-600">
            リンクの情報が不足しています。もう一度メールのリンクを開いてください。
          </p>
        )}
      </div>
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  );
}
