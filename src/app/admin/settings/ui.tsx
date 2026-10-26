"use client";

import { useState, useTransition } from "react";
import { flushSync } from "react-dom";
import {
  updateEmailSettings,
  updateEmployerInfo,
  updateShiftMonthStart,
  updatePayslipIssuer,
  updateTimesheetLock,
  updateClockMenu,
} from "./actions";
import {
  previewTaxReportTestRows,
  sendTaxReportTest,
  type TestPreviewRows,
} from "../report/actions";
import { captureReportPdfBase64 } from "../report/ui";
import { PayslipReport } from "../close/payslip-report";
import { SEAL_SIZES, type PayslipIssuer } from "@/lib/payslip-issuer";
import { shrinkSealImage } from "@/lib/seal-image";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** ファイル選択。ブラウザ既定の「ファイルを選択」はボタンに見えないので枠を付ける */
const fileInputClass =
  "text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50";

/**
 * シフト予定表の表示設定(1日始まり)。
 * シフト枠・休憩時間は適用開始日ごとに変わるため「営業と勤務時間」画面へ移した(2026-09-24)。
 * 2026-10-12: この欄自体も設定画面から「営業と勤務時間」画面の下部へ移した(勤務表ロック・QR打刻も同様)。
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
        シフト枠・休憩時間は、この画面の上で営業時間と一緒に適用開始日ごとに設定します。
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

/** 「QRコード無しの打刻」: アプリのメニューに「出退勤の記録」を出すか(2026-10-13 オーナー依頼。営業と勤務の画面) */
export function ClockMenuForm({ enabled }: { enabled: boolean }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        QRコード無しの打刻
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        出退勤のQRコードをかざすことなく、アプリの中だけで打刻ができるようになります。
        この場合も位置情報のチェックは行いますが、店舗の外でも打刻ができることになります。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateClockMenu(fd)))
        }
        className="mt-4"
      >
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            name="clock_menu_enabled"
            defaultChecked={enabled}
            className="h-4 w-4 rounded border-gray-300"
          />
          アプリのメニューに「出退勤の記録」を表示させる
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
  testSendTo,
  testPeriods,
}: {
  companyName: string;
  managerName: string;
  gmailUser: string;
  taxName: string;
  taxEmail: string;
  /** テスト送信先の初期値(ログイン中の管理者のメール) */
  testSendTo: string;
  /** テスト送信で選べる月度(先頭が当月度=初期値) */
  testPeriods: TestPeriodOption[];
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
        className="mt-4 max-w-3xl space-y-4"
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
        {/* 税理士の氏名 + メールアドレス。宛先は複数入れられるよう、パソコンでも幅を広く取る
            (氏名 2 : 宛先 3。スマホでは縦積みで全幅) */}
        <div className="grid gap-4 sm:grid-cols-5">
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-3">
            <label className="mb-1 block text-sm font-medium">
              税理士のメールアドレス
            </label>
            {/* 複数のアドレスが折り返して見えるよう textarea にする(改行も区切りとして受け付ける) */}
            <textarea
              name="tax_accountant_email"
              defaultValue={taxEmail}
              rows={2}
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="例: zeirishi@example.com, jimusho@example.com"
              className={`${inputClass} resize-none`}
            />
            <p className="mt-1 text-xs text-gray-400">
              給与明細画面の「税理士」ボタンからの送付先に使われます。複数のときはカンマ(,)で区切ってください
              (全員に同じ1通が届き、お互いのアドレスも見えます)
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
      <TestSendBlock defaultEmail={testSendTo} periods={testPeriods} />
    </section>
  );
}

/** テスト送信で選べる月度。label は「2026年11月度(入力受付中)」のように状態も付けたもの */
export type TestPeriodOption = { key: string; label: string };

/** テスト送信の添付PDFを撮るために画面外へ描画する明細一覧の id */
const TEST_REPORT_ID = "test-payslip-report";

/**
 * 税理士向けメールのテスト送信。締め処理を待たず、当月の現時点情報で文面・宛名を確認できる。
 * 2026-10-12: 独立した「テスト送信」欄をやめ、メール設定の枠の一番下に置いた(オーナー依頼)。
 * 2026-10-26: 本番の送信と同じく明細一覧のPDFも添付する(オーナー依頼)。この画面には明細一覧が
 * 無いので、締め画面と同じ表(PayslipReport)を送信時だけ画面外に描画して PDF にする。
 * 2026-10-26: 月度を選べるようにした(オーナー依頼)。締め前の月度は立替精算を乗せない(CSVと同じ)。
 */
function TestSendBlock({
  defaultEmail,
  periods,
}: {
  defaultEmail: string;
  periods: TestPeriodOption[];
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<Extract<
    TestPreviewRows,
    { ok: true }
  > | null>(null);

  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-700">テスト送信</h3>
      <p className="mt-1 text-sm text-gray-500">
        選んだ月度の情報で、税理士向けメールの宛名・文面・添付(CSV・PDF)を確認できます。
        締め前の月度は現時点の情報で作ります。件名の冒頭に「【テスト送信】」が付き、実際の締め処理は行われません。
        送信元のCCは付きません(本番の送信だけ)。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => {
            const to = String(fd.get("test_send_to") ?? "");
            const periodKey = String(fd.get("test_period") ?? "");
            // previewTaxReportTestRows は1回だけ呼び、sendTaxReportTest にそのまま
            // 渡す(Cloudflare Workers Free プランの CPU時間・サブリクエスト数の
            // 上限対策。同じ重い問い合わせを2回行わない)。
            const preview = await previewTaxReportTestRows(periodKey);
            if (!preview.ok) {
              setResult(preview);
              return;
            }
            // 明細一覧を描画し終えてから撮る。PDFが作れなければ送らない
            // (本番の送信と同じ。CSVだけ届くとPDFの欠落に気づけないため)
            flushSync(() => setReport(preview));
            let pdfBase64: string;
            try {
              pdfBase64 = await captureReportPdfBase64(TEST_REPORT_ID);
            } catch (e) {
              console.error(e);
              setResult({
                ok: false,
                message: "PDFの作成に失敗しました。もう一度お試しください",
              });
              return;
            } finally {
              setReport(null);
            }
            // 表の描画用の計算結果(payrolls)はサーバーへ送り返さない
            const data = {
              periodLabel: preview.periodLabel,
              companyName: preview.companyName,
              rows: preview.rows,
              periodStart: preview.periodStart,
              periodEnd: preview.periodEnd,
              paymentDate: preview.paymentDate,
              periodKey: preview.periodKey,
            };
            setResult(
              await sendTaxReportTest(to, data, {
                draft: preview.status === "open",
                pdfBase64,
              })
            );
          })
        }
        className="mt-4 max-w-md space-y-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">対象の月度</label>
          <select
            name="test_period"
            defaultValue={periods[0]?.key}
            className={inputClass}
          >
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
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
      {report && (
        // 添付PDF用。画面には出さない(撮影中は globals.css の pdf-capture-mode で全幅にして撮る)
        <div aria-hidden className="fixed top-0 -left-[10000px]">
          <PayslipReport
            id={TEST_REPORT_ID}
            period={{
              key: report.periodKey,
              label: report.periodLabel,
              start: report.periodStart,
              end: report.periodEnd,
              paymentDate: report.paymentDate,
            }}
            status={report.status}
            payrolls={report.payrolls}
            reimbursements={new Map(report.reimbursements)}
            mismatchIds={new Set()}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 給与明細PDF(給与明細画面の従業員別「PDF」ボタン)の右上に印字する
 * 「支払元」2行と「印」の画像を登録するフォーム。
 * 印はファイルを選んだときだけ差し替わる(何も選ばなければ現在の登録を維持)。
 */
/** 源泉徴収票の「支払者」(所在地・名称・電話)。従業員が出力する源泉徴収票の下段に印字する */
export function EmployerInfoForm({
  name,
  address,
  phone,
  companyName,
}: {
  name: string;
  address: string;
  phone: string;
  companyName: string;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">源泉徴収票(支払者)</h2>
      <p className="mt-1 text-sm text-gray-500">
        従業員が自分で出力する源泉徴収票の「支払者」欄に印字します。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => setResult(await updateEmployerInfo(fd)));
        }}
        className="mt-4 max-w-xl space-y-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            住所(居所)又は所在地
          </label>
          <input
            name="employer_address"
            defaultValue={address}
            placeholder="〒000-0000 都道府県から"
            className={inputClass}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              氏名又は名称
            </label>
            <input
              name="employer_name"
              defaultValue={name}
              placeholder={companyName || "屋号・会社名(代表者名)"}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">空欄なら会社名「{companyName || "未設定"}」を使います</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">電話番号</label>
            <input
              name="employer_phone"
              type="tel"
              defaultValue={phone}
              placeholder="00-0000-0000"
              className={inputClass}
            />
          </div>
        </div>
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
      {/* ⚠️ `action={fn}` ではなく onSubmit で送る。`action` だと React が送信後にフォームを
          自動でリセットし、保存に失敗したときも選んだ印のファイルが外れる。そのまま
          もう一度「保存する」を押すと印なしで「保存しました」と出て、印が保存されていない
          ことに気づけなかった(2026-10-10 本番で発生)。 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          startTransition(async () => {
            const seal = fd.get("seal");
            if (seal instanceof File && seal.size > 0) {
              try {
                // 150KB を超える画像はブラウザ側で縮小してから送る(seal-image.ts)
                fd.set("seal", await shrinkSealImage(seal));
              } catch (err) {
                setResult({
                  ok: false,
                  message:
                    err instanceof Error ? err.message : "画像の縮小に失敗しました",
                });
                return;
              }
            }
            const res = await updatePayslipIssuer(fd);
            setResult(res);
            if (res.ok) {
              // 保存できたときだけファイル選択と「印を削除する」を空に戻す
              const file = form.elements.namedItem("seal");
              if (file instanceof HTMLInputElement) file.value = "";
              const remove = form.elements.namedItem("remove_seal");
              if (remove instanceof HTMLInputElement) remove.checked = false;
            }
          });
        }}
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
            印の画像(png・jpg。150KBを超える画像は自動で縮小します)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="seal"
              accept="image/png,image/jpeg,image/webp,image/gif"
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
