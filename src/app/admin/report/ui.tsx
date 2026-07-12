"use client";

import { useState, useTransition } from "react";
import { buildTaxReportCsv, sendTaxReport } from "./actions";

const iconBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50";

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

function PrinterIcon({ className = "h-5 w-5" }: { className?: string }) {
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
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="2" />
      <path d="M7 17h10v4H7z" />
      <path d="M17 12.5h.01" />
    </svg>
  );
}

function DownloadIcon({ className = "h-5 w-5" }: { className?: string }) {
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
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      aria-label="印刷 / PDF保存"
      title="印刷 / PDF保存"
      className={iconBtn}
    >
      <PrinterIcon />
    </button>
  );
}

export function DownloadCsvButton({ periodKey }: { periodKey: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-1">
      <button
        disabled={pending}
        aria-label="CSVダウンロード"
        title="CSVダウンロード"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await buildTaxReportCsv(periodKey);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            // CSV文字列をBlob化してダウンロード(メールに手動添付できる)
            const blob = new Blob([res.csv], {
              type: "text/csv;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = res.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          });
        }}
        className={iconBtn}
      >
        <DownloadIcon />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function SendReportButton({ periodKey }: { periodKey: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await sendTaxReport(periodKey, note);
      setResult(res);
      if (res.ok) {
        setOpen(false);
        setNote("");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        aria-label="税理士へメール送信"
        title="税理士へメール送信"
        className={iconBtn}
      >
        <MailIcon />
      </button>
      {result && (
        <span
          className={`text-xs ${result.ok ? "text-green-700" : "text-red-600"}`}
        >
          {result.message}
        </span>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">
              税理士へメール送信
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              支給一覧のCSVを添付して送信します。補足事項(申し送り事項)があれば入力してください。空欄でも送信できます。
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="例: 今月は〇〇さんが入社しました。ご確認をお願いします。"
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {result && !result.ok && (
              <p className="mt-2 text-sm text-red-600">{result.message}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "送信中..." : "送信する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
