"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPairCode } from "./actions";

/**
 * 別の端末を承認する(端末承認制)。この端末(承認済み)で6桁の確認コードを出し、
 * 承認待ちの端末(機種変更したスマホ・ホーム画面アプリなど)に入力してもらう。
 * ホーム画面に追加する案内(/install)へのリンクも置く(そこから追加すると自動で承認が引き継がれる)。
 */
export function DeviceLinkSection() {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [code]);

  const left = code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0;

  // タップでコピーする(承認待ちの端末にそのまま貼り付けられるよう、数字6桁だけ)
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピーできないブラウザでは、表示を長押しして手でコピーしてもらう
    }
  }

  function show() {
    setError(null);
    startTransition(async () => {
      const r = await createPairCode();
      if (r.ok) {
        setCode({ code: r.code, expiresAt: Date.parse(r.expiresAt) });
        setNow(Date.now());
      } else {
        setCode(null);
        setError(r.message);
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">別の端末を承認する</h2>
      <p className="text-sm text-gray-600">
        機種変更したスマホなど、新しい端末で「承認待ち」と出たときに使います。下のボタンで出る6桁のコードを、その端末に入力してください。
      </p>
      {code && left > 0 ? (
        <div className="space-y-2">
          {/* 3桁ずつの間は余白(文字のスペースではない)で空ける。手でコピーしても数字6桁だけになる */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => copy(code.code)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                copy(code.code);
              }
            }}
            aria-label={`確認コード ${code.code}(タップでコピー)`}
            className="block w-full cursor-pointer select-all rounded-lg bg-blue-50 py-3 text-center font-mono text-4xl font-bold tracking-[0.2em] tabular-nums active:bg-blue-100"
          >
            <span>{code.code.slice(0, 3)}</span>
            <span className="ml-[0.4em]">{code.code.slice(3)}</span>
          </div>
          <p className="text-center text-xs text-gray-500 tabular-nums">
            {copied ? (
              <span className="font-medium text-green-700">コピーしました</span>
            ) : (
              "タップでコピーできます"
            )}
            {" ・ "}あと {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} 有効
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            このコードは他の人に教えないでください。お店や管理者が聞くことはありません。
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={show}
          disabled={pending}
          className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "準備中..." : code ? "新しいコードを表示する" : "コードを表示する"}
        </button>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-sm text-gray-600">
        この端末のホーム画面にアプリを追加するときは、
        <Link href="/install" className="text-blue-600 underline">
          ホーム画面に追加
        </Link>
        の案内から追加してください。追加したアプリは、初めて開いたときに自動で承認されます。
      </p>
    </section>
  );
}
