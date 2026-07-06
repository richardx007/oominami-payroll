"use client";

import { useState, useTransition } from "react";
import { sendTaxReport } from "./actions";
import type { ActionResult } from "../employees/actions";

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
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => {
          if (!window.confirm("税理士宛てに支給一覧をメール送信します。よろしいですか?"))
            return;
          startTransition(async () => setResult(await sendTaxReport(periodKey)));
        }}
        className="rounded-lg border border-blue-300 px-4 py-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
      >
        {pending ? "送信中..." : "税理士へメール送信"}
      </button>
      {result && (
        <span
          className={`text-xs ${result.ok ? "text-green-700" : "text-red-600"}`}
        >
          {result.message}
        </span>
      )}
    </span>
  );
}
