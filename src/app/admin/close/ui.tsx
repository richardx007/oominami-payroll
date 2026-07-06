"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closePeriod, markPaid, reopenPeriod } from "./actions";
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

  const statusLabel =
    status === "open"
      ? "入力受付中"
      : status === "closed"
        ? "締め済み"
        : "支払済み";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          状態:{" "}
          <span
            className={`rounded px-2 py-0.5 font-medium ${
              status === "open"
                ? "bg-green-50 text-green-700"
                : status === "closed"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex gap-2">
          {status === "open" && (
            <button
              disabled={pending}
              onClick={() =>
                run(
                  () => closePeriod(periodKey),
                  "この期間を締めます。バイトの入力がロックされ、給与明細が確定されます。よろしいですか?"
                )
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "処理中..." : "締め処理を実行"}
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
      </div>
      {result && (
        <p
          className={`mt-3 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
