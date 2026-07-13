"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closePeriod, emailPayslips, markPaid, reopenPeriod } from "./actions";
import type { ActionResult } from "../employees/actions";
import {
  SendReportButton,
  PrintButton,
  DownloadCsvButton,
} from "../report/ui";

function MailIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </svg>
  );
}

export function CloseActions({
  periodKey,
  status,
}: {
  periodKey: string;
  status: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  // useTransition の pending は router.refresh() を挟むと解除されず「処理中...」の
  // まま固まることがあるため、明示的な busy 状態を finally で必ず解除する。
  const [pending, setPending] = useState(false);

  async function run(
    action: () => Promise<ActionResult>,
    confirmMessage: string
  ) {
    if (!window.confirm(confirmMessage)) return;
    setPending(true);
    try {
      const res = await action();
      setResult(res);
      if (res.ok) router.refresh();
    } catch (e) {
      setResult({
        ok: false,
        message:
          "処理に失敗しました: " + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      {status === "open" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => closePeriod(periodKey),
                "この期間を締めます。従業員の入力がロックされ、給与明細が確定されます。よろしいですか?"
              )
            }
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "処理中..." : "締め処理を実行"}
          </button>
        </div>
      )}

      {/* 1行目: 締め解除・支払済みにする(締め済みのときのみ) */}
      {status === "closed" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => reopenPeriod(periodKey),
                "締めを解除して入力を再開できるようにします。よろしいですか?"
              )
            }
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            締め解除
          </button>
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => markPaid(periodKey),
                "この期間を支払済みにします。以降は締め解除できません。よろしいですか?"
              )
            }
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            支払済みにする
          </button>
        </div>
      )}

      {/* 2行目: 明細をメール配信・税理士へ・印刷・CSV(締め済み以降) */}
      {status !== "open" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => emailPayslips(periodKey, false),
                "全員に給与明細をメール配信します。よろしいですか?"
              )
            }
            aria-label="従業員へ明細をメール配信"
            title="従業員へ明細をメール配信"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            <MailIcon className="h-5 w-5" />
            従業員へ
          </button>
          <SendReportButton periodKey={periodKey} />
          <PrintButton />
          <DownloadCsvButton periodKey={periodKey} />
        </div>
      )}
      {result && (
        <p
          className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
