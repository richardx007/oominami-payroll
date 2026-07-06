"use client";

import { useState, useTransition } from "react";
import { updateLunchAllowance } from "./actions";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function LunchAllowanceForm({
  history,
}: {
  history: { lunch_allowance_per_day: number; effective_from: string }[];
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">昼食補助(勤務日数 × 定額)</h2>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateLunchAllowance(fd)))
        }
        className="mt-4 flex max-w-md gap-2"
      >
        <input
          name="lunch_allowance_per_day"
          type="number"
          min={0}
          required
          placeholder="1日あたり(円)"
          defaultValue={history[0]?.lunch_allowance_per_day}
          className={inputClass}
        />
        <input
          name="effective_from"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={inputClass}
        />
        <button
          disabled={pending}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          更新
        </button>
      </form>
      {result && (
        <p
          className={`mt-2 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
        >
          {result.message}
        </p>
      )}
      {history.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-gray-500">設定履歴</h3>
          <ul className="mt-1 space-y-1 text-sm text-gray-600">
            {history.map((h) => (
              <li key={h.effective_from}>
                {h.effective_from} から ¥
                {h.lunch_allowance_per_day.toLocaleString()}/日
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
