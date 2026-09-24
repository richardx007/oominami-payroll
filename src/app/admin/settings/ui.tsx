"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  updateEmailSettings,
  updateShiftMonthStart,
  updatePayslipIssuer,
  updateTimesheetLock,
  uploadWorkRules,
} from "./actions";
import { previewTaxReportTestRows, sendTaxReportTest } from "../report/actions";
import { SEAL_SIZES, type PayslipIssuer } from "@/lib/payslip-issuer";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** ファイル選択。ブラウザ既定の「ファイルを選択」はボタンに見えないので枠を付ける */
const fileInputClass =
  "text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50";

/**
 * シフト予定表の表示設定(1日始まり)。
 * シフト枠・休憩時間は適用開始日ごとに変わるため「営業と勤務時間」画面へ移した(2026-09-24)。
 */
export function ShiftMonthStartForm({ monthStart }: { monthStart: boolean }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        シフト予定表
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        シフト枠・休憩時間は
        <Link href="/admin/calendar/patterns" className="text-blue-700 hover:underline">
          「営業と勤務時間」
        </Link>
        で、営業時間と一緒に適用開始日ごとに設定します。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateShiftMonthStart(fd)))
        }
        className="mt-4 max-w-xl space-y-3"
      >
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
  managerName,
  gmailUser,
  taxName,
  taxEmail,
}: {
  companyName: string;
  managerName: string;
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
        {/* 会社名・責任者名 + 送信元メールを1行に横並び(スマホでは縦積み) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
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
                責任者名
              </label>
              <input
                name="manager_name"
                defaultValue={managerName}
                placeholder="例: 山田太郎"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-400">
                税理士向けメール末尾の署名(「会社名 責任者名」)に使われます(未入力なら会社名のみ)
              </p>
            </div>
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
            <textarea
              name="tax_accountant_name"
              defaultValue={taxName}
              rows={2}
              placeholder={"例: 〇〇税理士事務所\n山田太郎"}
              className={`${inputClass} resize-none`}
            />
            <p className="mt-1 text-xs text-gray-400">
              メール冒頭の宛名に使われます。1行目に事務所名、2行目に氏名を入力してください
              (氏名には自動で「様」が付きます・未入力なら「税理士 御中」)
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

/** 税理士向けメールのテスト送信。締め処理を待たず、当月の現時点情報で文面・宛名を確認できる */
export function TestSendForm({ defaultEmail }: { defaultEmail: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        テスト送信
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        締め処理の前でも、当月の現時点の情報で税理士向けメールの宛名・文面を確認できます。
        件名の冒頭に「【テスト送信】」が付き、実際の締め処理は行われません。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => {
            const to = String(fd.get("test_send_to") ?? "");
            // previewTaxReportTestRows は1回だけ呼び、sendTaxReportTest にそのまま
            // 渡す(Cloudflare Workers Free プランの CPU時間・サブリクエスト数の
            // 上限対策。同じ重い問い合わせを2回行わない)。
            const preview = await previewTaxReportTestRows();
            if (!preview.ok) {
              setResult(preview);
              return;
            }
            setResult(await sendTaxReportTest(to, preview));
          })
        }
        className="mt-4 max-w-md space-y-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">
            テスト送信先
          </label>
          <input
            name="test_send_to"
            type="email"
            required
            defaultValue={defaultEmail}
            placeholder="例: your-address@example.com"
            className={inputClass}
          />
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
          {pending ? "送信中..." : "税理士向けメールのテスト送信"}
        </button>
      </form>
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

/**
 * 給与明細PDF(給与明細画面の従業員別「PDF」ボタン)の右上に印字する
 * 「支払元」2行と「印」の画像を登録するフォーム。
 * 印はファイルを選んだときだけ差し替わる(何も選ばなければ現在の登録を維持)。
 */
export function PayslipIssuerForm({ issuer }: { issuer: PayslipIssuer }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        給与明細PDF(支払元・印)
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        給与明細画面で従業員ごとに出力するPDFの右上に印字する、支払元(2行)と印を登録します。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updatePayslipIssuer(fd)))
        }
        className="mt-4 max-w-xl space-y-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            支払元 1行目
          </label>
          <input
            name="payslip_payer_line1"
            defaultValue={issuer.line1}
            placeholder="株式会社オオミナミ"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            支払元 2行目
          </label>
          <input
            name="payslip_payer_line2"
            defaultValue={issuer.line2}
            placeholder="代表取締役 ○○ ○○"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            印の画像(png・jpg / 150KB以下)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="seal"
              accept="image/png,image/jpeg"
              className={fileInputClass}
            />
            {issuer.sealDataUrl && (
              // 登録済みの印。背景が白い画像でも分かるよう枠を付けて出す
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={issuer.sealDataUrl}
                alt="登録済みの印"
                className="h-16 w-16 rounded border border-gray-200 object-contain"
              />
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {issuer.sealFilename
              ? `現在の登録: ${issuer.sealFilename}(ファイルを選ばなければそのまま）`
              : "背景が透明のpngだと明細に自然に重なります"}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            印の印字サイズ(PDFに出す実寸)
          </label>
          <div className="flex flex-wrap gap-4">
            {SEAL_SIZES.map((size) => (
              <label
                key={size.mm}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <input
                  type="radio"
                  name="payslip_seal_size_mm"
                  value={size.mm}
                  defaultChecked={issuer.sealSizeMm === size.mm}
                  className="h-4 w-4 shrink-0"
                />
                {size.label}
              </label>
            ))}
          </div>
        </div>
        {issuer.sealDataUrl && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="remove_seal"
              className="h-4 w-4 shrink-0"
            />
            印を削除する(PDFに印を出さない)
          </label>
        )}
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
