"use client";

import { useEffect, useState, useTransition } from "react";
import { isDeviceApproved, redeemPairCode, signOutFromPending } from "./actions";

const POLL_MS = 5000;

export function DevicePendingView({
  name,
  label,
  revoked,
}: {
  name: string;
  label: string;
  revoked: boolean;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // 管理者が承認したら自動で切り替える
  useEffect(() => {
    if (revoked || done) return;
    const id = setInterval(async () => {
      try {
        if (await isDeviceApproved()) {
          setDone(true);
          window.location.replace("/");
        }
      } catch {
        // 通信が途切れても次の回で確かめる
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [revoked, done]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await redeemPairCode(code);
      setCode("");
      switch (r.result) {
        case "approved":
          setDone(true);
          window.location.replace("/");
          return;
        case "wrong":
          setError(
            r.remaining < 0
              ? "6桁の数字を入力してください。"
              : `コードが違います。承認済みの端末に出ている6桁を入力してください(あと${r.remaining}回)。`
          );
          return;
        case "locked":
          setError(
            "5回まちがえたため、このコードは使えなくなりました。承認済みの端末で新しいコードを出すか、管理者に承認を頼んでください。"
          );
          return;
        case "expired":
          setError(
            "使えるコードがありません(10分たったか、まだ出していません)。承認済みの端末でコードを出してから入力してください。"
          );
          return;
        case "not_pending":
          window.location.replace("/");
          return;
        default:
          setError("うまくいきませんでした。少し待ってからもう一度お試しください。");
      }
    });
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-gray-600">承認されました。画面を開いています…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center p-4 pt-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl font-bold text-amber-700">
            !
          </div>
          <h1 className="text-lg font-bold">
            {revoked ? "この端末は使えなくなっています" : "この端末はまだ承認されていません"}
          </h1>
          <p className="mt-2 text-left text-sm text-gray-600">
            {revoked
              ? "管理者がこの端末の承認を取り消しました。心当たりがない場合は管理者に連絡してください。"
              : "あなたのアカウントを守るため、初めて使う端末は承認が必要です。"}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {name ? `${name} さん` : ""}
            {label ? ` ・ ${label}` : ""}
          </p>
        </div>

        {!revoked && (
          <>
            <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-bold">確認コードで承認する</h2>
              <p className="text-sm text-gray-600">
                いつも使っている端末(Safari や前のスマホなど)でこのアプリを開き、
                <b>アカウント設定 → 別の端末を承認する</b> を押すと、6桁のコードが出ます。
              </p>
              <input
                id="pair-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                aria-label="確認コード"
                className="w-full rounded-lg border border-gray-300 py-3 text-center font-mono text-3xl tracking-[0.35em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={code.length !== 6 || pending}
                className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "確認中..." : "承認する"}
              </button>
            </form>

            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              または
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-bold">管理者に承認してもらう</h2>
              <p className="text-sm text-gray-600">
                管理者にはすでに通知が届いています。管理者が承認すると、この画面は自動で切り替わります。
                わからないときは管理者に声をかけてください。
              </p>
            </div>
          </>
        )}

        <form action={signOutFromPending} className="text-center">
          <button type="submit" className="text-sm text-gray-500 underline">
            ログアウト
          </button>
        </form>
      </div>
    </main>
  );
}
