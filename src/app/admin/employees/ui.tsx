"use client";

import { useState, useTransition } from "react";
import type { EmployeeRow } from "./page";
import {
  addEmployee,
  inviteEmployee,
  updateWage,
  updateTaxSetting,
  toggleEmployeeStatus,
  type ActionResult,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 適用開始日順に並べ、今日時点で有効な設定を返す */
function currentOf<T extends { effective_from: string }>(rows: T[]): T | null {
  const t = today();
  const applicable = rows
    .filter((r) => r.effective_from <= t)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return applicable[0] ?? rows.sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0] ?? null;
}

export function AddEmployeeForm() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await addEmployee(formData);
      setResult(res);
      if (res.ok) setOpen(false);
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">新規登録</h2>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {open ? "閉じる" : "+ 雇用者を追加"}
        </button>
      </div>
      {result && (
        <p
          className={`mt-3 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
        >
          {result.message}
        </p>
      )}
      {open && (
        <form action={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">雇用者No</label>
            <input name="employee_no" required className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">氏名</label>
            <input name="name" required className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              メールアドレス
            </label>
            <input name="email" type="email" required className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">時給(円)</label>
            <input
              name="hourly_wage"
              type="number"
              min={1}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">税区分</label>
            <select name="tax_category" defaultValue="otsu" className={inputClass}>
              <option value="otsu">乙欄(扶養控除等申告書 提出なし)</option>
              <option value="kou">甲欄(扶養控除等申告書 提出あり)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">扶養親族数</label>
            <input
              name="dependents"
              type="number"
              min={0}
              defaultValue={0}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">適用開始日</label>
            <input
              name="effective_from"
              type="date"
              defaultValue={today()}
              required
              className={inputClass}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "登録中..." : "登録する"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function EmployeeList({ employees }: { employees: EmployeeRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      setResult(await action());
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="rounded-t-xl border-b border-blue-100 bg-blue-50/70 p-4">
        <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">雇用者一覧</h2>
        {result && (
          <p
            className={`mt-1 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
          >
            {result.message}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-blue-100 bg-blue-50/60 text-left text-xs text-gray-600">
              <th className="px-4 py-2">No</th>
              <th className="px-4 py-2">氏名</th>
              <th className="hidden px-4 py-2 md:table-cell">メール</th>
              <th className="px-4 py-2">時給</th>
              <th className="px-4 py-2">税区分</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const wage = currentOf(emp.wage_rates);
              const tax = currentOf(emp.tax_settings);
              return (
                <EmployeeTableRow
                  key={emp.id}
                  emp={emp}
                  wage={wage}
                  tax={tax}
                  editing={editing === emp.id}
                  pending={pending}
                  onEdit={() =>
                    setEditing(editing === emp.id ? null : emp.id)
                  }
                  onRun={run}
                />
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  雇用者が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmployeeTableRow({
  emp,
  wage,
  tax,
  editing,
  pending,
  onEdit,
  onRun,
}: {
  emp: EmployeeRow;
  wage: { hourly_wage: number; effective_from: string } | null;
  tax: { tax_category: string; dependents: number; effective_from: string } | null;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onRun: (action: () => Promise<ActionResult>) => void;
}) {
  const retired = emp.status === "retired";
  return (
    <>
      <tr className={`border-b border-gray-50 ${retired ? "opacity-50" : ""}`}>
        <td className="px-4 py-3">{emp.employee_no}</td>
        <td className="px-4 py-3">
          {emp.name}
          {emp.is_admin && (
            <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
              管理者
            </span>
          )}
          {!emp.auth_user_id && !retired && (
            <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
              未登録
            </span>
          )}
        </td>
        <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
          {emp.email}
        </td>
        <td className="px-4 py-3">
          {wage ? `¥${wage.hourly_wage.toLocaleString()}` : "—"}
        </td>
        <td className="px-4 py-3">
          {tax ? (tax.tax_category === "kou" ? `甲欄(扶養${tax.dependents})` : "乙欄") : "—"}
        </td>
        <td className="px-4 py-3">{retired ? "退職" : "在籍"}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
            {!emp.auth_user_id && !retired && (
              <button
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `${emp.name} さん(${emp.email})に初回登録の招待メールを送信します。よろしいですか?`
                    )
                  ) {
                    onRun(() => inviteEmployee(emp.id));
                  }
                }}
                className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                招待
              </button>
            )}
            <button onClick={onEdit} className="text-blue-600 hover:underline">
              {editing ? "閉じる" : "編集"}
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-gray-50 bg-gray-50">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid gap-6 md:grid-cols-2">
              <form
                action={(fd) => onRun(() => updateWage(fd))}
                className="space-y-2"
              >
                <h3 className="text-xs font-semibold text-gray-500">
                  時給の変更(値上げは適用開始日を指定)
                </h3>
                <input type="hidden" name="employee_id" value={emp.id} />
                <div className="flex gap-2">
                  <input
                    name="hourly_wage"
                    type="number"
                    min={1}
                    defaultValue={wage?.hourly_wage}
                    required
                    placeholder="時給(円)"
                    className={inputClass}
                  />
                  <input
                    name="effective_from"
                    type="date"
                    defaultValue={today()}
                    required
                    className={inputClass}
                  />
                  <button
                    disabled={pending}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    更新
                  </button>
                </div>
              </form>
              <form
                action={(fd) => onRun(() => updateTaxSetting(fd))}
                className="space-y-2"
              >
                <h3 className="text-xs font-semibold text-gray-500">
                  税区分の変更
                </h3>
                <input type="hidden" name="employee_id" value={emp.id} />
                <div className="flex gap-2">
                  <select
                    name="tax_category"
                    defaultValue={tax?.tax_category ?? "otsu"}
                    className={inputClass}
                  >
                    <option value="otsu">乙欄</option>
                    <option value="kou">甲欄</option>
                  </select>
                  <input
                    name="dependents"
                    type="number"
                    min={0}
                    defaultValue={tax?.dependents ?? 0}
                    className={inputClass}
                    title="扶養親族数"
                  />
                  <input
                    name="effective_from"
                    type="date"
                    defaultValue={today()}
                    required
                    className={inputClass}
                  />
                  <button
                    disabled={pending}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    更新
                  </button>
                </div>
              </form>
            </div>
            {!emp.is_admin && (
              <div className="mt-4">
                <button
                  disabled={pending}
                  onClick={() =>
                    onRun(() =>
                      toggleEmployeeStatus(
                        emp.id,
                        retired ? "active" : "retired"
                      )
                    )
                  }
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  {retired ? "在籍に戻す" : "退職処理する"}
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
