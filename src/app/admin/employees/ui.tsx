"use client";

import { useState, useTransition } from "react";
import type { EmployeeRow } from "./page";
import {
  addEmployee,
  inviteEmployee,
  resetEmployeePassword,
  updateWage,
  updateTaxSetting,
  updateEmployeeProfile,
  toggleEmployeeStatus,
  countEmployeeWorkEntries,
  deleteEmployee,
  type ActionResult,
} from "./actions";

function TrashIcon({ className }: { className?: string }) {
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
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

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

function AddEmployeePanel() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"admin" | "employee">("employee");
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
    <>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {open ? "閉じる" : "+ 従業員を追加"}
      </button>
      {(open || result) && (
        <div className="mt-3 w-full basis-full">
          {result && (
            <p
              className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
            >
              {result.message}
            </p>
          )}
          {open && (
            <form
              action={handleSubmit}
              className="mt-3 grid gap-4 rounded-lg border border-blue-100 bg-white p-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">区分</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="role"
                      value="employee"
                      checked={role === "employee"}
                      onChange={() => setRole("employee")}
                    />
                    従業員(No: E___)
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={role === "admin"}
                      onChange={() => setRole("admin")}
                    />
                    管理者(No: M___)
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  従業員Noは区分に応じて自動採番されます
                </p>
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
              {role === "employee" && (
                <>
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
                </>
              )}
              <div className="flex items-end sm:col-span-2">
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
        </div>
      )}
    </>
  );
}

export function EmployeeList({ employees }: { employees: EmployeeRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await action();
      setResult(res);
      // 更新が成功したら編集用の吹き出しを閉じる
      if (res.ok) setEditing(null);
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="rounded-t-xl border-b border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">従業員一覧</h2>
          <AddEmployeePanel />
        </div>
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
            <tr className="border-b border-blue-200 bg-blue-100 text-left text-xs font-semibold text-gray-700">
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
                  従業員が登録されていません
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
  // 削除フロー: 0=非表示, 1=1回目の警告(元に戻せません), 2=2回目の警告(勤務実績も削除)
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [workCount, setWorkCount] = useState(0);
  const [deleteResult, setDeleteResult] = useState<ActionResult | null>(null);
  const [deletePending, startDelete] = useTransition();

  // 1回目の「削除」→ 勤務実績を確認。あれば2回目の警告へ、無ければそのまま削除。
  function proceedFromFirstWarning() {
    setDeleteResult(null);
    startDelete(async () => {
      const n = await countEmployeeWorkEntries(emp.id);
      if (n > 0) {
        // 勤務実績があるときは2回目の警告を出してから削除する
        setWorkCount(n);
        setDeleteStep(2);
        return;
      }
      // 勤務実績が無ければそのまま削除
      const res = await deleteEmployee(emp.id);
      setDeleteResult(res);
      if (!res.ok) setDeleteStep(0);
    });
  }

  function runDelete() {
    startDelete(async () => {
      const res = await deleteEmployee(emp.id);
      setDeleteResult(res);
      // 成功時は行が消える(revalidateで再描画)。失敗時のみパネルを閉じる。
      if (!res.ok) setDeleteStep(0);
    });
  }

  function resetDelete() {
    setDeleteStep(0);
    setDeleteResult(null);
    setWorkCount(0);
  }

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
            {emp.auth_user_id && !retired && (
              <button
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `${emp.name} さん(${emp.email})にパスワード再設定メールを送信します。よろしいですか?`
                    )
                  ) {
                    onRun(() => resetEmployeePassword(emp.id));
                  }
                }}
                className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                パスワード再設定
              </button>
            )}
            <button onClick={onEdit} className="text-blue-600 hover:underline">
              {editing ? "閉じる" : "編集"}
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7} className="px-4 pb-5 pt-1">
            {/* 明細行から浮き出した吹き出し風の編集パネル */}
            <div className="relative rounded-xl border border-blue-200 bg-white p-5 shadow-lg ring-1 ring-blue-100">
              <span
                aria-hidden
                className="absolute -top-2 left-8 h-4 w-4 rotate-45 border-l border-t border-blue-200 bg-white"
              />
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-blue-800">
                  {emp.employee_no} {emp.name} さんの編集
                </h3>
                <button
                  onClick={onEdit}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕ 閉じる
                </button>
              </div>

              <form
                action={(fd) => onRun(() => updateEmployeeProfile(fd))}
                className="mb-5 space-y-2"
              >
                <h4 className="text-xs font-semibold text-gray-500">
                  氏名・メールアドレスの変更
                </h4>
                <input type="hidden" name="employee_id" value={emp.id} />
                <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                  <input
                    name="name"
                    defaultValue={emp.name}
                    required
                    placeholder="氏名"
                    className={inputClass}
                  />
                  <input
                    name="email"
                    type="email"
                    defaultValue={emp.email}
                    required
                    placeholder="メールアドレス"
                    className={inputClass}
                  />
                  <button
                    disabled={pending}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    更新
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  ※ メールアドレスを変更すると「未登録」に戻り、再度の招待が必要になります
                </p>
              </form>

              {!emp.is_admin && (
                <div className="grid gap-6 border-t border-gray-100 pt-4 md:grid-cols-2">
                  <form
                    action={(fd) => onRun(() => updateWage(fd))}
                    className="space-y-2"
                  >
                    <h4 className="text-xs font-semibold text-gray-500">
                      時給の変更(値上げは適用開始日を指定)
                    </h4>
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
                    <h4 className="text-xs font-semibold text-gray-500">
                      税区分の変更
                    </h4>
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
              )}

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
                {!emp.is_admin ? (
                  <button
                    disabled={pending || deletePending}
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
                ) : (
                  <span />
                )}

                <button
                  disabled={pending || deletePending}
                  onClick={() => {
                    setDeleteResult(null);
                    setDeleteStep(1);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  削除
                </button>
              </div>

              {/* 1回目の警告 */}
              {deleteStep === 1 && (
                <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">
                    {emp.name} さんを削除します。この操作は元に戻せません。
                  </p>
                  {deleteResult && !deleteResult.ok && (
                    <p className="mt-2 text-sm text-red-600">
                      {deleteResult.message}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={deletePending}
                      onClick={proceedFromFirstWarning}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                      {deletePending ? "確認中..." : "削除"}
                    </button>
                    <button
                      disabled={deletePending}
                      onClick={resetDelete}
                      className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {/* 2回目の警告(勤務実績あり) */}
              {deleteStep === 2 && (
                <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">
                    この従業員の勤務実績も全て削除されます。（{workCount}件）
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    この操作は元に戻せません。本当に削除しますか？
                  </p>
                  {deleteResult && !deleteResult.ok && (
                    <p className="mt-2 text-sm text-red-600">
                      {deleteResult.message}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={deletePending}
                      onClick={runDelete}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                      {deletePending ? "削除中..." : "全て削除"}
                    </button>
                    <button
                      disabled={deletePending}
                      onClick={resetDelete}
                      className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
