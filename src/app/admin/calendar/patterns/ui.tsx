"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonthsYm,
  buildCalendarView,
  classifyDayType,
  dayOfWeek,
  DAY_TYPE_LABELS,
  generateMonthRows,
  minutesToInput,
  parseTimeInput,
  PATTERN_BASE_DATE,
  regenerateTargetMonths,
  type DayType,
  type HourPattern,
} from "@/lib/business-calendar-view";
import { deleteHourPatterns, saveHourPatterns } from "../actions";
import type { ActionResult } from "../../employees/actions";

const ORDER: DayType[] = ["weekday", "fri", "sat", "sun", "holiday", "pre_holiday"];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// iOS の日付ピッカーが縮まないよう幅を確保する（mobile-date-time-inputs）
const dateClass =
  "w-40 shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm";

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 px-1.5 py-2 text-base focus:border-blue-500 sm:px-2 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 sm:text-sm";

type Row = { day_type: DayType; is_open: boolean; open: string; close: string; overnight: boolean };

function toRow(p: HourPattern | undefined, t: DayType): Row {
  return {
    day_type: t,
    is_open: p?.is_open ?? true,
    open: minutesToInput(p?.open_min ?? 600),
    close: minutesToInput(p?.close_min ?? 1440),
    overnight: p?.overnight ?? false,
  };
}

/** "2026/10/1〜"（最初の定義は「最初から」） */
function versionLabel(effectiveFrom: string): string {
  if (effectiveFrom === PATTERN_BASE_DATE) return "最初から";
  return `${Number(effectiveFrom.slice(0, 4))}/${Number(effectiveFrom.slice(5, 7))}/${Number(effectiveFrom.slice(8, 10))}〜`;
}

/** 入力中の行 → 定義（時刻が不正なら null） */
function toPattern(r: Row): HourPattern | null {
  const open = parseTimeInput(r.open);
  const close = parseTimeInput(r.close);
  if (!r.is_open) return { day_type: r.day_type, is_open: false, open_min: null, close_min: null, overnight: false };
  if (open == null || open >= 1440) return null;
  if (!r.overnight && (close == null || close <= open)) return null;
  return { day_type: r.day_type, is_open: true, open_min: open, close_min: r.overnight ? null : close, overnight: r.overnight };
}

export function PatternsForm({
  patterns,
  exampleHolidays,
  createdMonths,
  today,
}: {
  patterns: HourPattern[];
  exampleHolidays: Record<string, string>;
  createdMonths: string[];
  today: string;
}) {
  const router = useRouter();
  // 適用開始日ごとの定義（古い順）
  const versions = [...new Set(patterns.map((p) => p.effective_from ?? PATTERN_BASE_DATE))].sort();
  const rowsOf = (from: string) => {
    const byType = new Map(patterns.filter((p) => (p.effective_from ?? PATTERN_BASE_DATE) === from).map((p) => [p.day_type, p]));
    return ORDER.map((t) => toRow(byType.get(t), t));
  };
  // 今日使われている定義を最初に開く
  const current = versions.filter((v) => v <= today).at(-1) ?? versions[0] ?? PATTERN_BASE_DATE;

  // selected: 開いている定義の適用開始日。null は「適用開始日を追加」中
  const [selected, setSelected] = useState<string | null>(current);
  const [newFrom, setNewFrom] = useState(`${addMonthsYm(today.slice(0, 7), 1)}-01`);
  const [rows, setRows] = useState<Row[]>(rowsOf(current));
  const [regenerate, setRegenerate] = useState(true);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setResult(null);
  };

  const open = (from: string) => {
    setSelected(from);
    setRows(rowsOf(from));
    setResult(null);
  };

  /** 今開いている定義を写して、新しい適用開始日の定義を作り始める */
  const startNew = () => {
    setSelected(null);
    setResult(null);
  };

  const effectiveFrom = selected ?? newFrom;
  const newFromValid = /^\d{4}-\d{2}-\d{2}$/.test(newFrom) && newFrom > PATTERN_BASE_DATE;
  const duplicate = selected == null && versions.includes(newFrom);
  const targets = selected == null && !newFromValid ? [] : regenerateTargetMonths(createdMonths, effectiveFrom, today);
  const publicLimit = addMonthsYm(today.slice(0, 7), 1);
  const publicTargets = targets.filter((m) => m <= publicLimit);
  const monthNames = (ms: string[]) => ms.map((m) => `${Number(m.slice(5, 7))}月`).join("・");
  // 次の定義（この定義が使われるのはその前日まで）
  const nextVersion = versions.find((v) => v > effectiveFrom);

  const parsed = rows.map(toPattern);
  const valid = parsed.every((p) => p != null);

  // 結果例: 2026年9月の連休（入力中の定義で計算）
  const example = (() => {
    if (!valid) return null;
    const monthRows = generateMonthRows("2026-09", exampleHolidays, parsed as HourPattern[]);
    const view = buildCalendarView(monthRows);
    const keys = ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];
    return keys.map((k) => {
      const d = view.days.get(k)!;
      const band = view.spans.find((s) => s.kind === "business" && s.startKey <= k && s.endKey >= k);
      let shown: string;
      if (d.status === "closed") shown = "定休";
      else if (band) shown = band.startKey === k ? `初日${band.startLabel}〜通し` : band.endKey === k ? `〜最終${band.endLabel}` : "（通し）";
      else shown = d.timeLabel ?? "";
      return { k, type: classifyDayType(k, exampleHolidays), holiday: d.holidayName, shown, stay: d.stay };
    });
  })();

  function save() {
    if (selected == null && (!newFromValid || duplicate)) {
      setResult({ ok: false, message: duplicate ? "この適用開始日の定義はすでにあります" : "適用開始日を入力してください" });
      return;
    }
    const bad = rows.findIndex((_, i) => parsed[i] == null);
    if (bad >= 0) {
      setResult({
        ok: false,
        message: `「${DAY_TYPE_LABELS[rows[bad].day_type]}」の時刻を確認してください（10:00 のように。深夜の閉店は 26:00）`,
      });
      return;
    }
    startTransition(async () => {
      const r = await saveHourPatterns(effectiveFrom, parsed as HourPattern[], regenerate && targets.length > 0);
      setResult(r);
      if (r.ok) {
        setSelected(effectiveFrom);
        router.refresh();
      }
    });
  }

  function remove() {
    if (selected == null || selected === PATTERN_BASE_DATE) return;
    if (!window.confirm(`${versionLabel(selected)} の定義を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      const r = await deleteHourPatterns(selected, regenerate && targets.length > 0);
      setResult(r);
      if (r.ok) {
        const rest = versions.filter((v) => v !== selected);
        const back = rest.filter((v) => v <= today).at(-1) ?? rest[0] ?? PATTERN_BASE_DATE;
        setSelected(back);
        setRows(rowsOf(back));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/calendar" className="text-sm text-blue-700 hover:underline">
          ← 営業カレンダー
        </Link>
        <h1 className="mt-1 text-xl font-bold">営業時間の定義</h1>
        <p className="mt-1 text-sm text-gray-500">
          区分ごとの「いつもの営業時間」です。毎月の営業カレンダーはこの定義から作られます。
          営業時間が変わるときは「適用開始日を追加」して、その日からの定義を作ります。
        </p>
      </div>

      {/* 適用開始日ごとの定義 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => open(v)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                selected === v ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {versionLabel(v)}
              {v === current && <span className={`ml-1 text-xs ${selected === v ? "text-blue-100" : "text-green-700"}`}>適用中</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={startNew}
            className={`rounded-full border border-dashed px-3 py-1.5 text-sm font-semibold ${
              selected == null ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-400 bg-white text-gray-600"
            }`}
          >
            ＋ 適用開始日を追加
          </button>
        </div>

        {selected == null ? (
          <div className="space-y-1 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={newFrom}
                onChange={(e) => {
                  setNewFrom(e.target.value);
                  setResult(null);
                }}
                aria-label="適用開始日"
                className={`${dateClass} bg-white ${duplicate ? "border-red-400" : ""}`}
              />
              <span className="text-sm text-gray-700">から使う営業時間</span>
            </div>
            <p className={`text-xs ${duplicate ? "text-red-600" : "text-gray-600"}`}>
              {duplicate
                ? "この適用開始日の定義はすでにあります。上のボタンから開いて直してください。"
                : "いま下に表示している定義を写して始めます。変わる区分だけ直して保存してください。"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {selected === PATTERN_BASE_DATE ? "最初の定義" : `${versionLabel(selected)} の定義`}
            {nextVersion ? `（${versionLabel(nextVersion).replace("〜", "")} の前日まで使われます）` : ""}
          </p>
        )}
      </section>

      <div className="space-y-6">
        {/* 区分ごとに1行（区分｜営業/定休｜開店｜閉店｜通し）。画面の横幅いっぱいを使う */}
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-2 sm:p-4">
          <div className="grid grid-cols-[2.75rem_auto_1fr_1fr_auto] items-center gap-x-1.5 gap-y-1.5 sm:grid-cols-[4.5rem_auto_1fr_1fr_auto] sm:gap-x-3">
            <span />
            <span />
            <span className="text-xs text-gray-500">開店</span>
            <span className="text-xs text-gray-500">閉店</span>
            <span className="text-xs text-gray-500">
              <span className="sm:hidden">通し</span>
              <span className="hidden sm:inline">翌日まで通し（お泊まり可）</span>
            </span>
            {rows.map((r, i) => {
              const bad = !parsed[i];
              return (
                <div key={r.day_type} className="contents">
                  <span className={`whitespace-nowrap text-sm font-bold sm:text-base ${bad ? "text-red-600" : "text-gray-800"}`}>
                    {DAY_TYPE_LABELS[r.day_type]}
                  </span>
                  <div className="flex overflow-hidden rounded-lg border border-gray-300 text-xs font-semibold sm:text-sm">
                    <button
                      type="button"
                      onClick={() => update(i, { is_open: true })}
                      className={`px-2 py-2 sm:px-3 ${r.is_open ? "bg-green-600 text-white" : "bg-white text-gray-600"}`}
                    >
                      営業
                    </button>
                    <button
                      type="button"
                      onClick={() => update(i, { is_open: false })}
                      className={`px-2 py-2 sm:px-3 ${!r.is_open ? "bg-gray-600 text-white" : "bg-white text-gray-600"}`}
                    >
                      定休
                    </button>
                  </div>
                  <input
                    value={r.is_open ? r.open : ""}
                    onChange={(e) => update(i, { open: e.target.value })}
                    placeholder={r.is_open ? "10:00" : "—"}
                    disabled={!r.is_open}
                    inputMode="numeric"
                    aria-label={`${DAY_TYPE_LABELS[r.day_type]}の開店`}
                    className={`${inputClass} ${bad ? "border-red-400" : ""}`}
                  />
                  <input
                    value={r.is_open && !r.overnight ? r.close : ""}
                    onChange={(e) => update(i, { close: e.target.value })}
                    placeholder={!r.is_open ? "—" : r.overnight ? "通し" : "24:00"}
                    disabled={!r.is_open || r.overnight}
                    inputMode="numeric"
                    aria-label={`${DAY_TYPE_LABELS[r.day_type]}の閉店`}
                    className={`${inputClass} ${bad ? "border-red-400" : ""}`}
                  />
                  <label className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={r.is_open && r.overnight}
                      disabled={!r.is_open}
                      onChange={(e) => update(i, { overnight: e.target.checked })}
                      aria-label={`${DAY_TYPE_LABELS[r.day_type]}は翌日まで通し`}
                      className="h-5 w-5"
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-500">
            時刻は 10:00 のように入力します。深夜0時をまたいで閉店する場合は 26:00 のように書きます。
            前の日から通しで続いている日は、開店時刻は使われません。
          </p>

          {targets.length > 0 && (
            <label className="flex items-start gap-2 rounded-lg bg-yellow-50 p-3 text-sm">
              <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium text-gray-800">作成済みの月（{monthNames(targets)}）にも反映する</span>
                <span className="mt-0.5 block text-xs text-gray-600">
                  手で直した日はそのまま残ります。
                  {publicTargets.length > 0
                    ? `${monthNames(publicTargets)}は公開中のため、ホームページの表示もすぐ変わります。`
                    : "公開中の月は変わりません（必要なら日ごとに直してください）。"}
                </span>
              </span>
            </label>
          )}

          {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>}
          <button
            onClick={save}
            disabled={pending}
            className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "保存中..." : selected == null ? "この適用開始日で追加する" : "保存する"}
          </button>
          {selected != null && selected !== PATTERN_BASE_DATE && (
            <button
              onClick={remove}
              disabled={pending}
              className="w-full rounded-lg border border-red-300 bg-white px-6 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              この定義を削除する
            </button>
          )}
        </section>

        <section className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">区分の決まり方</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>翌日が祝日 → <b>祝前日</b></li>
              <li>その日が祝日 → <b>祝</b>（ただし金・土の祝日は「金」「土」の営業時間。日付は祝日として赤字）</li>
              <li>それ以外 → 曜日（月〜木／金／土／日）</li>
            </ol>
            <p className="mt-2 text-xs text-gray-500">年末年始などは、作成後に日ごとに直してください。</p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">結果例（2026年9月の連休）</h2>
            {example ? (
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {example.map((e) => {
                    const dow = dayOfWeek(e.k);
                    return (
                      <tr key={e.k} className="border-t border-gray-100">
                        <td className={`py-1 pr-2 font-medium ${e.holiday || dow === 0 ? "text-red-600" : dow === 6 ? "text-blue-600" : ""}`}>
                          {Number(e.k.slice(8, 10))}日({WEEKDAYS[dow]})
                        </td>
                        <td className="py-1 pr-2 text-xs text-gray-500">{DAY_TYPE_LABELS[e.type]}</td>
                        <td className="py-1 text-green-800">
                          {e.shown}
                          {e.stay && <span className="ml-1 text-xs text-green-600">泊</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-gray-500">時刻を正しく入力すると表示されます。</p>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
