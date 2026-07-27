"use client";

import { useState, useTransition } from "react";
import { buildDailyReportCsv, setAdvancePayment } from "./actions";

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

function PrintButton() {
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

function DownloadDailyCsvButton({
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
        open ? "rotate-180" : ""
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * 対象期間の合計をまとめた枠。見出し(対象期間)をタップで開閉し、既定は閉じておく
 * (日ごとの明細をすぐ見たいことが多いため)。CSVダウンロード・印刷もこの枠に収める。
 */
export function DailySummary({
  from,
  to,
  days,
  workMinutes,
  total,
  advance,
}: {
  from: string;
  to: string;
  days: number;
  workMinutes: number;
  total: number;
  advance: number;
}) {
  const [open, setOpen] = useState(false);
  const yen = (n: number) => `¥${n.toLocaleString()}`;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          対象期間{" "}
          <span className="tabular-nums">
            {from.replaceAll("-", "/")}〜{to.replaceAll("-", "/")}
          </span>
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <dl className="max-w-xs space-y-1 text-sm font-semibold text-gray-900">
            <div className="flex items-baseline justify-between gap-4">
              <dt>のべ勤務日数</dt>
              <dd className="tabular-nums">{days}日</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>合計勤務時間</dt>
              <dd className="tabular-nums">{hhmm(workMinutes)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>支給額合計</dt>
              <dd className="tabular-nums">{yen(total)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>前払金 記録済み</dt>
              <dd className="tabular-nums">{yen(advance)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-2 print:hidden">
            <DownloadDailyCsvButton from={from} to={to} />
            <PrintButton />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * その日の日当を「前払金」として記録/取消するボタン。
 * 記録すると、その勤務日を含む給与期間の給与計算で差引支給額から控除される
 * (総支給額・課税対象額・源泉所得税は変わらない)。
 *
 * 保存中フラグは useTransition ではなく自前の state で持つ。useTransition の
 * pending は revalidatePath による再レンダーが適用されるまで解除されず、複数行を
 * 続けて押すと後から押した行の遷移が先の行の再レンダーに巻き取られて「記録中...」の
 * まま固まることがあったため(保存自体は成功している)。finally で必ず解除する。
 */
export function AdvanceToggle({
  employeeId,
  workDate,
  amount,
  recorded,
  disabled,
}: {
  employeeId: string;
  workDate: string;
  /** その日の支給額(記録するときの金額) */
  amount: number;
  /** 記録済みの金額。null なら未記録 */
  recorded: number | null;
  /** 退勤未入力など、金額が確定できない日は記録させない */
  disabled?: boolean;
}) {
  // サーバーの再レンダーを待たず即座に表示を切り替えるためのローカル状態
  const [value, setValue] = useState(recorded);
  const [serverValue, setServerValue] = useState(recorded);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // サーバー側の値が変わったら追従する(期間の切り替え・再読み込み時)
  if (serverValue !== recorded) {
    setServerValue(recorded);
    setValue(recorded);
  }

  async function run(next: number | null) {
    setError(null);
    setSaving(true);
    const before = value;
    setValue(next);
    try {
      const res = await setAdvancePayment(employeeId, workDate, next);
      if (!res.ok) {
        setValue(before);
        setError(res.message);
      }
    } catch {
      setValue(before);
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (value !== null) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-amber-700 tabular-nums">
            ¥{value.toLocaleString()}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => run(null)}
            title="前払金の記録を取り消す"
            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 print:hidden"
          >
            {saving ? "..." : "取消"}
          </button>
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={saving || disabled}
        onClick={() => run(amount)}
        title="この日の支給額を前払金として記録する"
        className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40 print:hidden"
      >
        {saving ? "記録中..." : "前払済"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
