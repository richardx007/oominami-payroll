"use client";

import { useState, useTransition } from "react";
import { importTaxTable, updateLunchAllowance } from "./actions";
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
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">昼食補助(勤務日数 × 定額)</h2>
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

export function TaxTableForm({ years }: { years: [number, number][] }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">源泉徴収税額表(月額表)</h2>
      <p className="mt-1 text-sm text-gray-500">
        課税対象額が月88,000円以上の人がいる場合に必要です(88,000円未満は自動計算:
        乙欄3.063%・甲欄0円)。国税庁の月額表をもとに、1行1区分で貼り付けてください。
      </p>
      <div className="mt-2 rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600">
        形式: 以上,未満,乙欄税額,甲欄扶養0,甲欄扶養1,甲欄扶養2,甲欄扶養3
        <br />
        例: 88000,89000,3200,130,0,0,0
        <br />
        (甲欄が不要なら乙欄税額まででOK。最終行の「未満」は空欄で上限なし)
      </div>
      {years.length > 0 && (
        <p className="mt-2 text-sm text-green-700">
          登録済み: {years.map(([y, c]) => `${y}年(${c}区分)`).join("、")}
        </p>
      )}
      <form
        action={(fd) =>
          startTransition(async () => setResult(await importTaxTable(fd)))
        }
        className="mt-3 space-y-3"
      >
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">対象年</label>
          <input
            name="year"
            type="number"
            required
            defaultValue={new Date().getFullYear()}
            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <textarea
          name="csv"
          rows={6}
          placeholder={"88000,89000,3200,130,0,0,0\n89000,90000,3200,180,0,0,0"}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {result && (
          <p
            className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
          >
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "取り込み中..." : "取り込む(同年度は入れ替え)"}
        </button>
      </form>
    </section>
  );
}
