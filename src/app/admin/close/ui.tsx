"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closePeriod, emailPayslips, markPaid, reopenPeriod } from "./actions";
import type { ActionResult } from "../employees/actions";

export function CloseActions({
  periodKey,
  status,
}: {
  periodKey: string;
  status: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
          {status === "open" && (
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
          )}
          {status !== "open" && (
            <button
              disabled={pending}
              onClick={() =>
                run(
                  () => emailPayslips(periodKey, false),
                  "全員に給与明細をメール配信します。よろしいですか?"
                )
              }
              className="rounded-lg border border-blue-300 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              明細をメール配信
            </button>
          )}
          {status === "closed" && (
            <>
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
            </>
          )}
      </div>
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
