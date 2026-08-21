"use client";

import { useState, useTransition } from "react";
import {
  updateBreakWindows,
  updateEmailSettings,
  updateLunchAllowance,
  updateShiftSlots,
  updateTimesheetLock,
  uploadWorkRules,
} from "./actions";
import type { SlotDef, SlotKey } from "@/lib/shifts";
import { minutesToHHMM, type BreakWindow } from "@/lib/breaks";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** シフト枠(A/B/C)のラベル・時刻を編集するフォーム */
export function ShiftSlotsForm({
  slots,
  monthStart,
}: {
  slots: Record<SlotKey, SlotDef>;
  monthStart: boolean;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const keys: SlotKey[] = ["A", "B", "C"];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        シフト枠
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        シフト予定表で使う3枠の名前と時刻を設定します。深夜0時は「0:00」で表記します。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateShiftSlots(fd)))
        }
        className="mt-4 max-w-xl space-y-3"
      >
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-[auto_1fr_1fr_1fr] items-end gap-2">
            <div className="w-14">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                名前
              </label>
              <input
                name={`${k.toLowerCase()}_label`}
                defaultValue={slots[k].label}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                開始
              </label>
              <input
                name={`${k.toLowerCase()}_start`}
                defaultValue={slots[k].start}
                placeholder="8:00"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                終了
              </label>
              <input
                name={`${k.toLowerCase()}_end`}
                defaultValue={slots[k].end}
                placeholder="17:00"
                className={inputClass}
              />
            </div>
            <div className="pb-2 text-xs text-gray-400">枠{slots[k].label}</div>
          </div>
        ))}
        {/* シフト予定表の月の区切り。勤務表(給与計算)は26日始まりのまま。 */}
        <label className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm">
          <input
            type="checkbox"
            name="month_start"
            defaultChecked={monthStart}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            <span className="font-medium text-gray-700">
              シフト予定表を「1日始まり」で表示する
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              オフのときは給与期間と同じ26日始まり。勤務表(給与計算)は変更されません。
            </span>
          </span>
        </label>
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </form>
    </section>
  );
}

/** 標準休憩時間帯(3枠)を編集するフォーム。深夜勤務で休憩をいつ取るかにより深夜割増が
 *  変わってしまう問題を避けるため、休憩はこの3枠に取る前提で勤務時間・深夜勤務手当を計算する。 */
export function BreakWindowsForm({ windows }: { windows: BreakWindow[] }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        休憩時間
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        休憩は原則この3つの時間帯に取るものとして、勤務時間・深夜勤務手当を計算します
        (深夜の休憩をいつ取るかで支給額が変わらないようにするため、都度申告はしません)。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateBreakWindows(fd)))
        }
        className="mt-4 max-w-md space-y-3"
      >
        {[1, 2, 3].map((n, i) => (
          <div key={n} className="grid grid-cols-[auto_1fr_auto_1fr] items-end gap-2">
            <div className="pb-2 text-xs text-gray-400">枠{n}</div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                開始
              </label>
              <input
                name={`break_${n}_start`}
                defaultValue={minutesToHHMM(windows[i][0])}
                placeholder="12:00"
                className={inputClass}
              />
            </div>
            <div className="pb-2 text-center text-xs text-gray-400">〜</div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                終了
              </label>
              <input
                name={`break_${n}_end`}
                defaultValue={minutesToHHMM(windows[i][1])}
                placeholder="13:00"
                className={inputClass}
              />
            </div>
          </div>
        ))}
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </form>
    </section>
  );
}

/** 従業員による出退勤時刻・休憩時間の編集ロックのON/OFF切替 */
export function TimesheetLockForm({ locked }: { locked: boolean }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        勤務表ロック
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        ロックすると、従業員は勤務表で出勤・退勤時刻と休憩時間を編集できなくなります
        （交通費・メモは引き続き編集可）。QR打刻での出退勤登録は影響を受けません。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateTimesheetLock(fd)))
        }
        className="mt-4"
      >
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            name="lock_employee_time_edit"
            defaultChecked={locked}
            className="h-4 w-4 rounded border-gray-300"
          />
          従業員による出退勤時刻・休憩時間の編集をロックする
        </label>
        {result && (
          <p
            className={`mt-2 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
          >
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="mt-3 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </form>
    </section>
  );
}

export function EmailSettingsForm({
  companyName,
  gmailUser,
  taxName,
  taxEmail,
}: {
  companyName: string;
  gmailUser: string;
  taxName: string;
  taxEmail: string;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        メール設定
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        給与明細や連絡メールの送信元・宛先を設定します。パスワード(アプリパスワード)のみ、
        安全のためシステム管理者がサーバー側で管理します。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateEmailSettings(fd)))
        }
        className="mt-4 max-w-2xl space-y-4"
      >
        {/* 会社名 + 送信元メールを1行に横並び(スマホでは縦積み) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              会社名・事業者名
            </label>
            <input
              name="company_name"
              defaultValue={companyName}
              placeholder="例: 大波株式会社"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              メールの差出人名に使われます(未入力なら「給与管理システム」)
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              送信元メールアドレス(Gmail)
            </label>
            <input
              name="gmail_user"
              type="email"
              defaultValue={gmailUser}
              placeholder="例: oominami2026@gmail.com"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              このGmailアカウントのアプリパスワードがサーバー側に設定されている必要があります
            </p>
          </div>
        </div>
        {/* 税理士の氏名 + メールアドレスを1行に横並び(スマホでは縦積み) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              税理士の氏名
            </label>
            <input
              name="tax_accountant_name"
              defaultValue={taxName}
              placeholder="例: 山田太郎"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              メール冒頭の宛名(「〇〇 様」)に使われます(未入力なら「税理士 御中」)
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              税理士のメールアドレス
            </label>
            <input
              name="tax_accountant_email"
              type="email"
              defaultValue={taxEmail}
              placeholder="例: zeirishi@example.com"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              「税理士資料」画面からの送付先に使われます
            </p>
          </div>
        </div>
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
          {pending ? "保存中..." : "保存する"}
        </button>
      </form>
    </section>
  );
}

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

/** 勤務ルール文書(jpg/png/pdf)のアップロード。既存文書があれば置き換える。 */
export function WorkRulesForm({
  currentFilename,
  previewUrl,
}: {
  currentFilename: string | null;
  previewUrl: string | null;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        勤務ルール
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        勤務ルールを記載した文書(jpg・png・pdf)をアップロードします。従業員・管理者ともメニューの
        「勤務ルール」からいつでも確認できます。
      </p>
      {currentFilename && (
        <p className="mt-2 text-sm text-gray-600">
          現在の登録:{" "}
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-700"
            >
              {currentFilename}
            </a>
          ) : (
            currentFilename
          )}
        </p>
      )}
      <form
        action={(fd) =>
          startTransition(async () => setResult(await uploadWorkRules(fd)))
        }
        className="mt-3 flex flex-wrap items-center gap-3"
      >
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,application/pdf"
          required
          className="text-sm"
        />
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "アップロード中..." : "アップロードする"}
        </button>
      </form>
    </section>
  );
}
