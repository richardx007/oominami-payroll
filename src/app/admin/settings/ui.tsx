"use client";

import { useState, useTransition } from "react";
import {
  importTaxTable,
  updateEmailSettings,
  updateLunchAllowance,
  updateShiftSlots,
  updateTimesheetLock,
} from "./actions";
import type { SlotDef, SlotKey } from "@/lib/shifts";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** シフト枠(A/B/C)のラベル・時刻を編集するフォーム */
export function ShiftSlotsForm({
  slots,
}: {
  slots: Record<SlotKey, SlotDef>;
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
        シフト予定表で使う3枠の名前と時刻を設定します。深夜0時は「24:00」と入力できます。
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

export type TaxTableRow = {
  year: number;
  min_amount: number;
  max_amount: number | null;
  tax_otsu: number;
  tax_kou_0: number | null;
  tax_kou_1: number | null;
  tax_kou_2: number | null;
  tax_kou_3: number | null;
  tax_kou_4: number | null;
  tax_kou_5: number | null;
  tax_kou_6: number | null;
  tax_kou_7: number | null;
  created_at: string;
};

/** ISO日時を日本時間の「yyyy/M/D HH:MM」表記にする */
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function yen(n: number | null) {
  return n === null || n === undefined ? "—" : n.toLocaleString();
}

export function TaxTableForm({ rows }: { rows: TaxTableRow[] }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // 年ごとに区分数・取り込み日時(最新)を集計(登録済み表示用)
  const yearCounts = new Map<number, number>();
  const yearImportedAt = new Map<number, string>();
  for (const r of rows) {
    yearCounts.set(r.year, (yearCounts.get(r.year) ?? 0) + 1);
    const prev = yearImportedAt.get(r.year);
    if (!prev || r.created_at > prev) yearImportedAt.set(r.year, r.created_at);
  }
  const years = [...yearCounts.keys()].sort((a, b) => b - a);

  const [viewYear, setViewYear] = useState<number | null>(years[0] ?? null);
  const shownRows = rows.filter((r) => r.year === viewYear);
  const viewImportedAt = viewYear ? yearImportedAt.get(viewYear) : undefined;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">源泉徴収税額表(月額表)</h2>
      <p className="mt-1 text-sm text-gray-500">
        課税対象額が月88,000円以上の人がいる場合に必要です(88,000円未満は自動計算:
        乙欄3.063%・甲欄0円)。国税庁の月額表をもとに、1行1区分で貼り付けてください。
      </p>

      {/* 国税庁のダウンロードページへのリンクとコピペ手順 */}
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm">
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(
            "源泉徴収税額表(月額表)"
          )}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
        >
          「源泉徴収税額表(月額表)」をWeb検索する
          <span aria-hidden>↗</span>
        </a>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-gray-600">
          <li>
            検索結果から国税庁の対象年分の
            <strong>「給与所得の源泉徴収税額表（月額表）」</strong>
            のExcel(またはCSV)をダウンロードします。
          </li>
          <li>
            ダウンロードしたファイルをExcel等で開き、
            <strong>「その月の社会保険料等控除後の給与等の金額」の“以上・未満”</strong>
            、<strong>甲欄(扶養0〜7人)</strong>、<strong>乙欄</strong>
            の各列の数値を選択してコピーします。
          </li>
          <li>
            下の入力欄にそのまま貼り付けます。Excelからの貼り付けは
            <strong>タブ区切り</strong>になりますが、そのまま取り込めます(数値内の
            桁区切りカンマも自動で除去します)。列の並びは
            <strong>「以上,未満,甲0〜甲7,乙」</strong>
            です(下の形式・例を参照)。
          </li>
          <li>「対象年」を合わせて「取り込む」を押すと、その年分に置き換わります。</li>
        </ol>
        <p className="mt-2 text-xs text-gray-400">
          ※ 国税庁は月額表をExcel/PDFで公開しているため、当システムから自動取得はできません。
          公開様式・ページ構成は年により変わることがあります。
        </p>
      </div>

      <div className="mt-2 rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600">
        形式: 以上,未満,甲0,甲1,甲2,甲3,甲4,甲5,甲6,甲7,乙
        <br />
        例: 88000,89000,130,0,0,0,0,0,0,0,3200
        <br />
        (国税庁の公開項目をそのまま保持します。甲欄の途中列は空欄可、乙欄は必須。
        最終行の「未満」は空欄で上限なし。乙欄のみなら「以上,未満,乙」の3列でも可)
      </div>
      {years.length > 0 && (
        <div className="mt-2 space-y-0.5 text-sm text-green-700">
          {years.map((y) => (
            <p key={y}>
              登録済み: {y}年({yearCounts.get(y)}区分)
              {yearImportedAt.get(y) && (
                <span className="ml-2 text-xs text-gray-500">
                  取り込み日時 {formatDateTime(yearImportedAt.get(y)!)}
                </span>
              )}
            </p>
          ))}
        </div>
      )}
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              setResult(await importTaxTable(fd));
            } catch (e) {
              // 例外時も pending を確実に解除し、原因を画面に出す
              setResult({
                ok: false,
                message:
                  "取り込みに失敗しました: " +
                  (e instanceof Error ? e.message : String(e)),
              });
            }
          })
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
          placeholder={
            "88000,89000,130,0,0,0,0,0,0,0,3200\n89000,90000,180,0,0,0,0,0,0,0,3200"
          }
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

      {/* 取り込み済みデータの表表示 */}
      {years.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">取り込み済みデータ</h3>
            <select
              value={viewYear ?? ""}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              {shownRows.length}区分
            </span>
            {viewImportedAt && (
              <span className="text-xs text-gray-400">
                / 取り込み日時 {formatDateTime(viewImportedAt)}
              </span>
            )}
          </div>
          <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 text-right">以上</th>
                  <th className="px-2 py-1.5 text-right">未満</th>
                  <th className="px-2 py-1.5 text-right">甲0</th>
                  <th className="px-2 py-1.5 text-right">甲1</th>
                  <th className="px-2 py-1.5 text-right">甲2</th>
                  <th className="px-2 py-1.5 text-right">甲3</th>
                  <th className="px-2 py-1.5 text-right">甲4</th>
                  <th className="px-2 py-1.5 text-right">甲5</th>
                  <th className="px-2 py-1.5 text-right">甲6</th>
                  <th className="px-2 py-1.5 text-right">甲7</th>
                  <th className="px-2 py-1.5 text-right">乙</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1">{yen(r.min_amount)}</td>
                    <td className="px-2 py-1 text-gray-500">
                      {r.max_amount === null ? "以上" : yen(r.max_amount)}
                    </td>
                    <td className="px-2 py-1">{yen(r.tax_kou_0)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_1)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_2)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_3)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_4)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_5)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_6)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_7)}</td>
                    <td className="px-2 py-1 font-medium">{yen(r.tax_otsu)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
