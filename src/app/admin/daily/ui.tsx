"use client";

import { useState, useTransition } from "react";
import { buildDailyReportCsv } from "./actions";

const iconBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50";

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
      type="button"
      onClick={() => window.print()}
      aria-label="印刷 / PDF保存"
      title="印刷 / PDF保存"
      className={iconBtn}
    >
      <PrinterIcon />
    </button>
  );
}

export function DownloadDailyCsvButton({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label="CSVダウンロード"
        title="CSVダウンロード"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await buildDailyReportCsv(from, to);
            if (!res.ok) {
              setError(res.message);
              return;
            }
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
