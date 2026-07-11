"use client";

import { useState, useTransition } from "react";
import { buildTaxReportCsv, sendTaxReport } from "./actions";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-700"
    >
      印刷 / PDF保存
    </button>
  );
}

export function DownloadCsvButton({ periodKey }: { periodKey: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
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
        className="rounded-lg bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "作成中..." : "CSVダウンロード"}
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
    <span className="flex items-center gap-2">
      <button
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        className="rounded-lg bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-700"
      >
        税理士へメール送信
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
