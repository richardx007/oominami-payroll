"use client";

import { useState, useTransition } from "react";
import { buildDailyReportCsv, setAdvancePayment } from "./actions";

// アイコンではなく文字(PDF / CSV)で見せるボタン。給与明細画面(admin/report/ui.tsx)の
// textBtn とスタイルを揃えている。
const textBtn =
  "inline-flex h-10 items-center justify-center rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50";

/**
 * 日別実績のCSVダウンロード(文字ボタン)。
 * 以前はページ内の折りたたみ枠に隠れたアイコンボタンだったため、
 * ページ見出し横の目立つ位置に文字ボタンとして出すよう変更した(2026-08-05)。
 */
export function DownloadDailyCsvButton({ from, to }: { from: string; to: string }) {
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
        className={textBtn}
      >
        {pending ? "作成中..." : "CSV"}
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
    <div className="rounded-xl border border-result-200 bg-result-50">
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
 * **記録する金額はその日の支給額と一致しなくてよい。** 「前払済」ボタンはその日の支給額を
 * ワンタップで記録する近道にすぎず、金額をタップすれば実際に渡した額に修正できる。
 * 打刻を後から修正して支給額が変わった場合など、渡した額と支給額がずれるのは実務上ふつうに
 * 起きるため(2026-08-01に実際に発生)、**渡した額をそのまま残す**のを正とする。
 * 差額はその月の他の勤務日の支給額で自動的に精算される。
 * 支給額と違う額が記録されているときは、気付けるよう差額を併記する。
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
  /** その日の支給額(「前払済」ワンタップで記録する既定の金額) */
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
  // 金額の手入力(実際に渡した額が支給額と違うとき)
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

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

  function startEdit() {
    setError(null);
    setDraft(String(value ?? amount));
    setEditing(true);
  }

  async function commitEdit() {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0) {
      setError("金額は0以上の整数で入力してください");
      return;
    }
    setEditing(false);
    await run(n);
  }

  if (editing) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5 print:hidden">
        <span className="inline-flex items-center gap-1">
          <span className="text-xs text-gray-500">¥</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-24 rounded border border-amber-400 px-1.5 py-0.5 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <button
            type="button"
            disabled={saving}
            onClick={commitEdit}
            className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            中止
          </button>
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  if (value !== null) {
    // 実際に渡した額と、その日の支給額の差(0 なら一致)
    const diff = value - amount;
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            disabled={saving}
            onClick={startEdit}
            title="実際に渡した金額に修正する"
            className="font-medium text-amber-700 underline decoration-dotted underline-offset-2 tabular-nums disabled:opacity-50 print:no-underline"
          >
            ¥{value.toLocaleString()}
          </button>
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
        {/* 支給額と違う額を渡している場合は差額を出す(誤記録に気付けるようにするため) */}
        {diff !== 0 && (
          <span
            title={`この日の支給額 ¥${amount.toLocaleString()} との差額`}
            className="whitespace-nowrap text-xs font-medium text-red-600"
          >
            支給額と{diff > 0 ? "+" : "−"}¥{Math.abs(diff).toLocaleString()}
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center gap-1 print:hidden">
        <button
          type="button"
          disabled={saving || disabled}
          onClick={() => run(amount)}
          title="この日の支給額を前払金として記録する"
          className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40"
        >
          {saving ? "記録中..." : "前払済"}
        </button>
        {/* 支給額と違う額を渡したときはこちらから入力する */}
        <button
          type="button"
          disabled={saving || disabled}
          onClick={startEdit}
          title="支給額と違う金額を前払金として記録する"
          className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          金額指定
        </button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
