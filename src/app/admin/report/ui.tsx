"use client";

import { useState, useTransition } from "react";
import { buildTaxReportMail } from "./actions";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-700"
    >
      印刷 / PDF保存
    </button>
  );
}

export function SendReportButton({ periodKey }: { periodKey: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await buildTaxReportMail(periodKey);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            // mailto は RFC6068 のパーセントエンコードが必要(空白は %20)。
            // URLSearchParams だと空白が + になり一部メールアプリで化けるため手組みする。
            const q = [
              `subject=${encodeURIComponent(res.subject)}`,
              res.cc ? `cc=${encodeURIComponent(res.cc)}` : "",
              `body=${encodeURIComponent(res.body)}`,
            ]
              .filter(Boolean)
              .join("&");
            // メールアプリの作成画面を開く(送信前に確認・追記が可能)
            window.location.href = `mailto:${encodeURIComponent(res.to)}?${q}`;
          });
        }}
        className="rounded-lg border border-blue-300 px-4 py-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
      >
        {pending ? "作成中..." : "税理士へメール作成"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
