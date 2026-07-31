"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closePeriod, emailPayslips, markPaid, reopenPeriod } from "./actions";
import type { ActionResult } from "../employees/actions";
import {
  SendReportButton,
  DownloadPdfButton,
  DownloadCsvButton,
} from "../report/ui";

function MailIcon({ className = "h-5 w-5" }: { className?: string }) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </svg>
  );
}

export function CloseActions({
  periodKey,
  status,
}: {
  periodKey: string;
  status: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  // useTransition の pending は router.refresh() を挟むと解除されず「処理中...」の
  // まま固まることがあるため、明示的な busy 状態を finally で必ず解除する。
  const [pending, setPending] = useState(false);
  // 全員配信の進捗(「n/total 件送信済み」の表示用)
  const [emailProgress, setEmailProgress] = useState<{
    sent: number;
    total: number;
  } | null>(null);

  /**
   * 全員へのメール配信。Cloudflare Workers Free プランのCPU時間上限対策として、
   * サーバー側で少人数ずつ(既定5人)に区切って処理する `emailPayslips` を、
   * `hasMore` が false になるまでオフセットを進めながら繰り返し呼び出す。
   * 1回のリクエストが少人数分のSMTP送信(TLSハンドシェイクのCPU負荷)しか
   * 行わないため、全体の人数が増えてもCPU時間の上限に引っかかりにくくなる。
   */
  async function runEmailAll() {
    if (
      !window.confirm("全員に給与明細をメール配信します。よろしいですか?")
    )
      return;
    setPending(true);
    setResult(null);
    setEmailProgress(null);
    let offset = 0;
    let totalSent = 0;
    const failedAll: string[] = [];
    let lastTotal = 0;
    try {
      for (;;) {
        const res = await emailPayslips(periodKey, false, offset, 5);
        lastTotal = res.total;
        totalSent += res.sent;
        setEmailProgress({ sent: totalSent, total: res.total });
        if (!res.ok && res.sent === 0 && res.total === 0) {
          // 配信対象なし・期間不正などバッチ以前のエラー
          setResult(res);
          return;
        }
        if (!res.ok) {
          // メッセージから「n件送信 / 失敗: ...」の失敗部分だけ拾えないため、
          // バッチごとの失敗メッセージをそのまま蓄積する
          failedAll.push(res.message);
        }
        if (!res.hasMore) break;
        offset += 5;
      }
      setResult(
        failedAll.length > 0
          ? {
              ok: totalSent > 0,
              message: `${totalSent}/${lastTotal}件送信 / 失敗あり: ${failedAll.join(" / ")}`,
            }
          : { ok: true, message: `${totalSent}名に給与明細をメール配信しました` }
      );
      router.refresh();
    } catch (e) {
      setResult({
        ok: false,
        message:
          "処理に失敗しました: " + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setPending(false);
      setEmailProgress(null);
    }
  }

  async function run(
    action: () => Promise<ActionResult>,
    confirmMessage: string
  ) {
    if (!window.confirm(confirmMessage)) return;
    setPending(true);
    try {
      const res = await action();
      setResult(res);
      if (res.ok) router.refresh();
    } catch (e) {
      setResult({
        ok: false,
        message:
          "処理に失敗しました: " + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      {status === "open" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
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
        </div>
      )}

      {/* 1行目: 締め解除・支払済みにする(締め済みのときのみ) */}
      {status === "closed" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
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
        </div>
      )}

      {/* 2行目: 明細をメール配信・税理士へ・PDF・CSV(締め済み以降) */}
      {status !== "open" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            disabled={pending}
            onClick={runEmailAll}
            aria-label="従業員へ明細をメール配信"
            title="従業員へ明細をメール配信"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            <MailIcon className="h-5 w-5" />
            {emailProgress
              ? `送信中... ${emailProgress.sent}/${emailProgress.total}`
              : "従業員へ"}
          </button>
          <SendReportButton periodKey={periodKey} />
          {/* スマホ(iOSのPWA)では window.print() が動かないため、印刷ではなくPDFダウンロード。
              対象は明細一覧の枠(close/page.tsx の id="payslip-report") */}
          <DownloadPdfButton
            targetId="payslip-report"
            filename={`給与明細_${periodKey}.pdf`}
          />
          <DownloadCsvButton periodKey={periodKey} />
        </div>
      )}
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
