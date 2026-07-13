"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period";
import {
  adjacentPeriodKey,
  datesInPeriod,
  formatMinutes,
  workMinutes,
} from "@/lib/period";
import type { WorkEntry } from "./page";
import { type ActionResult } from "./actions";

export type TimesheetEmployee = { id: string; name: string };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

// 出勤・退勤・休憩の3カラム用。iOSのtimeコントロールは指定幅より広く描画され
// 隣と重なるため、フォントをやや小さく・横パディングを詰めて本体幅を抑える。
const timeInputClass =
  "w-full min-w-0 box-border rounded-lg border border-gray-300 bg-white px-1.5 py-2.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const TRANSPORT_MODES = ["鉄道", "バス", "自転車", "その他"];

export function TimesheetCalendar({
  period,
  entries,
  closed,
  stations,
  holidays,
  today,
  save,
  del,
  basePath = "/timesheet",
  employees,
  selectedEmployeeId,
  employeeName,
}: {
  period: Period;
  entries: WorkEntry[];
  closed: boolean;
  stations: string[];
  holidays: Record<string, string>;
  today: string;
  /** 勤務記録の保存アクション(従業員=自分, 管理者=対象従業員にバインド済み) */
  save: (formData: FormData) => Promise<ActionResult>;
  /** 勤務記録の削除アクション */
  del: (workDate: string) => Promise<ActionResult>;
  /** 期間ナビのリンク先ベース("/timesheet" または "/admin/timesheet") */
  basePath?: string;
  /** 管理者用: 従業員選択リスト(指定時はセレクトを表示) */
  employees?: TimesheetEmployee[];
  selectedEmployeeId?: string;
  /** 従業員用: 固定表示する自分の氏名 */
  employeeName?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // 期間ナビ・従業員切替で保持するクエリ(管理者は従業員IDを引き継ぐ)
  const empQuery = selectedEmployeeId ? `&e=${selectedEmployeeId}` : "";
  function periodHref(delta: 1 | -1) {
    return `${basePath}?p=${adjacentPeriodKey(period.key, delta)}${empQuery}`;
  }

  const entryMap = useMemo(
    () => new Map(entries.map((e) => [e.work_date, e])),
    [entries]
  );

  const dates = useMemo(() => datesInPeriod(period), [period]);

  // カレンダーを週ごとに区切る(日曜始まり)
  const weeks = useMemo(() => {
    const result: (string | null)[][] = [];
    let week: (string | null)[] = [];
    const firstDow = new Date(dates[0] + "T00:00:00Z").getUTCDay();
    for (let i = 0; i < firstDow; i++) week.push(null);
    for (const d of dates) {
      week.push(d);
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      result.push(week);
    }
    return result;
  }, [dates]);

  const summary = useMemo(() => {
    let minutes = 0;
    let transport = 0;
    for (const e of entries) {
      minutes += workMinutes(e.start_time, e.end_time, e.break_minutes);
      transport += e.transport_cost;
    }
    return { days: entries.length, minutes, transport };
  }, [entries]);

  const selectedEntry = selected ? entryMap.get(selected) : undefined;
  // 新規日(未入力日)の既定値: 最後に表示/入力した勤務記録を引き継ぐ。
  // これにより別の日の勤務情報をそのまま新規入力に流用できる。無ければ EntryForm の既定値。
  const [lastDefaults, setLastDefaults] = useState<WorkEntry | null>(null);

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const res = await save(formData);
      setResult(res);
      if (res.ok) {
        // 入力内容を次の新規日へ引き継げるよう保持しておく
        setLastDefaults(entryFromFormData(formData));
        setSelected(null);
        router.refresh();
      }
    });
  }

  function remove(workDate: string) {
    startTransition(async () => {
      const res = await del(workDate);
      setResult(res);
      if (res.ok) {
        setSelected(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
      {/* 左カラム: 期間ナビ・サマリ・カレンダー */}
      <div className="space-y-4">
        {/* 期間ナビ + 従業員フィールド。iPhone でも 年月・前後ボタン・従業員欄が
            1行に収まるよう、年月の文字を控えめ(text-xl)にして横一列に並べる。 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push(periodHref(-1))}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </button>
          <div className="shrink-0 text-center leading-tight">
            <div className="text-xl font-extrabold tracking-tight text-blue-800">
              {period.label}
            </div>
          </div>
          <button
            onClick={() => router.push(periodHref(1))}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </button>

          {/* 右端: 従業員フィールド(管理者=リスト選択 / 従業員=氏名固定)。
              残り幅いっぱいに広げ、名前が切れにくいようにする(flex-1) */}
          <div className="ml-auto min-w-0 flex-1">
            {employees ? (
              <select
                value={selectedEmployeeId ?? ""}
                onChange={(e) =>
                  router.push(`${basePath}?p=${period.key}&e=${e.target.value}`)
                }
                aria-label="従業員を選択"
                className="w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            ) : employeeName ? (
              <span className="block truncate text-right text-sm font-semibold text-gray-700">
                {employeeName}
              </span>
            ) : null}
          </div>
        </div>

        {closed && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            この期間は締め済みのため入力・修正できません
          </p>
        )}

        {/* サマリ(枠なし・文字のみ。左端に「合計」、日数/時間の見出しは省略) */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-base text-gray-600">
          <span className="font-semibold text-gray-700">合計</span>
          <span className="font-bold text-gray-900">{summary.days}日</span>
          <span className="font-bold text-gray-900">
            {formatMinutes(summary.minutes) || "0時間"}
          </span>
          <span>
            交通費{" "}
            <span className="font-bold text-gray-900">
              ¥{summary.transport.toLocaleString()}
            </span>
          </span>
        </div>

        {result && !result.ok && (
          <p className="text-sm text-red-600">{result.message}</p>
        )}

        {/* カレンダー */}
        <div className="rounded-xl border border-gray-200 bg-white p-2">
          <div className="grid grid-cols-7 text-center text-xs text-gray-500">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}
              >
                {w}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((date, di) => {
                if (!date) return <div key={di} />;
                const entry = entryMap.get(date);
                const day = Number(date.slice(8, 10));
                const isSelected = selected === date;
                const isToday = date === today;
                const isHoliday = !!holidays[date];
                // 文字色: 選択中は白、それ以外は 祝日/日曜=赤、土曜=青
                const textColor = isSelected
                  ? ""
                  : isHoliday || di === 0
                    ? "text-red-500"
                    : di === 6
                      ? "text-blue-500"
                      : "";
                return (
                  <button
                    key={date}
                    onClick={() => {
                      setResult(null);
                      const next = isSelected ? null : date;
                      // 既存入力のある日を開いたら、その内容を以降の新規日の既定値に
                      const e = next ? entryMap.get(next) : undefined;
                      if (e) setLastDefaults(e);
                      setSelected(next);
                    }}
                    title={holidays[date] ?? undefined}
                    className={`m-0.5 flex min-h-14 flex-col items-center rounded-lg p-1 text-sm transition ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : entry
                          ? "bg-blue-50 text-blue-900"
                          : isToday
                            ? "bg-gray-200"
                            : "hover:bg-gray-50"
                    } ${isToday && !isSelected ? "ring-2 ring-gray-400" : ""}`}
                  >
                    <span className={textColor}>{day}</span>
                    {entry && (
                      <span
                        className={`mt-0.5 text-[10px] leading-tight ${isSelected ? "text-blue-100" : "text-blue-700"}`}
                      >
                        {entry.start_time}
                        <br />
                        {entry.end_time}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 右カラム(スマホでは下): 日を選ぶと入力フォーム、未選択時は勤務一覧表 */}
      <div className="lg:sticky lg:top-20">
        {selected && !closed && (
          <EntryForm
            key={selected}
            date={selected}
            entry={selectedEntry}
            defaults={lastDefaults}
            pending={pending}
            stations={stations}
            onSave={handleSave}
            onDelete={remove}
          />
        )}
        {selected && closed && selectedEntry && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h3 className="font-semibold">{formatDateJa(selected)}</h3>
            <p className="mt-2 text-gray-600">
              {selectedEntry.start_time}〜{selectedEntry.end_time}(休憩
              {selectedEntry.break_minutes}分)/ 交通費 ¥
              {selectedEntry.transport_cost.toLocaleString()}
            </p>
          </div>
        )}
        {/* 未選択(締め済みで入力欄が出ない場合含む)は勤務一覧表を表示 */}
        {(!selected || (closed && !selectedEntry)) && (
          <WorkList
            entries={entries}
            onSelect={(d) => {
              setResult(null);
              const e = entryMap.get(d);
              if (e) setLastDefaults(e);
              setSelected(d);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** WorkEntry を FormData から組み立てる(次の新規日の既定値に流用するため) */
function entryFromFormData(fd: FormData): WorkEntry {
  const s = (k: string) => (fd.get(k)?.toString() ?? "").trim();
  return {
    work_date: s("work_date"),
    start_time: s("start_time"),
    end_time: s("end_time"),
    break_minutes: Number(s("break_minutes")) || 0,
    transport_cost: Number(s("transport_cost")) || 0,
    transport_mode: s("transport_mode") || null,
    station_from: s("station_from") || null,
    station_to: s("station_to") || null,
    round_trip: s("round_trip") === "on",
    note: s("note") || null,
  };
}

/** カレンダー下(スマホ)/右(PC)の勤務一覧表。日・曜日・出勤・退勤・勤務時間・交通費。 */
function WorkList({
  entries,
  onSelect,
}: {
  entries: WorkEntry[];
  onSelect: (workDate: string) => void;
}) {
  const rows = [...entries].sort((a, b) =>
    a.work_date.localeCompare(b.work_date)
  );
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
        勤務一覧
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-gray-400">
          この月の勤務入力はまだありません。カレンダーの日付を選んで入力してください。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-2 py-1.5 text-right">日</th>
                <th className="px-1 py-1.5 text-center">曜</th>
                <th className="px-2 py-1.5 text-center">出勤</th>
                <th className="px-2 py-1.5 text-center">退勤</th>
                <th className="px-2 py-1.5 text-right">勤務</th>
                <th className="px-2 py-1.5 text-right">交通費</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const d = new Date(e.work_date + "T00:00:00Z");
                const dow = d.getUTCDay();
                const dowColor =
                  dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "";
                const mins = workMinutes(
                  e.start_time,
                  e.end_time,
                  e.break_minutes
                );
                return (
                  <tr
                    key={e.work_date}
                    onClick={() => onSelect(e.work_date)}
                    className="cursor-pointer border-b border-gray-50 hover:bg-blue-50/40"
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {d.getUTCDate()}
                    </td>
                    <td className={`px-1 py-1.5 text-center ${dowColor}`}>
                      {WEEKDAYS[dow]}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-center tabular-nums">
                      {e.start_time}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-center tabular-nums">
                      {e.end_time}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {formatMinutes(mins) || "0時間"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      ¥{e.transport_cost.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDateJa(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS[d.getUTCDay()]})`;
}

function EntryForm({
  date,
  entry,
  defaults,
  pending,
  stations,
  onSave,
  onDelete,
}: {
  date: string;
  entry: WorkEntry | undefined;
  defaults: WorkEntry | null;
  pending: boolean;
  stations: string[];
  onSave: (fd: FormData) => void;
  onDelete: (date: string) => void;
}) {
  const init = entry ?? defaults;

  const formRef = useRef<HTMLFormElement>(null);
  const modeRef = useRef<HTMLSelectElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // カスタムバリデーション(吹き出し)をリセット
  function resetValidity() {
    fromRef.current?.setCustomValidity("");
    toRef.current?.setCustomValidity("");
    costRef.current?.setCustomValidity("");
  }

  // × ボタン: 交通費フィールドを全てクリア
  function clearTransport() {
    resetValidity();
    if (modeRef.current) modeRef.current.value = "";
    if (costRef.current) costRef.current.value = "";
    if (fromRef.current) fromRef.current.value = "";
    if (toRef.current) toRef.current.value = "";
    formRef.current
      ?.querySelectorAll<HTMLInputElement>('input[name="round_trip"]')
      .forEach((r) => (r.checked = false));
  }

  // 交通費は「区間1・区間2・金額(>0)」を全てセットで入力する(金額0=空欄扱い)。
  // 何か1つでも入力されていれば不足分をネイティブの吹き出しで促す。全空欄はOK。
  function validateTransport(): boolean {
    resetValidity();
    const from = fromRef.current?.value.trim() ?? "";
    const to = toRef.current?.value.trim() ?? "";
    const cost = Number(costRef.current?.value || "0") || 0;
    const anyEntered = from !== "" || to !== "" || cost > 0;
    if (!anyEntered) return true;

    let firstInvalid: HTMLElement | null = null;
    if (!from) {
      fromRef.current?.setCustomValidity("この欄に入力してください");
      firstInvalid ??= fromRef.current;
    }
    if (!to) {
      toRef.current?.setCustomValidity("この欄に入力してください");
      firstInvalid ??= toRef.current;
    }
    if (cost <= 0) {
      costRef.current?.setCustomValidity("この欄に入力してください");
      firstInvalid ??= costRef.current;
    }
    if (firstInvalid) {
      formRef.current?.reportValidity();
      return false;
    }
    return true;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateTransport()) return;
    onSave(new FormData(e.currentTarget));
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="work_date" value={date} />
        {/* 日付タイトルと同じ行の右側に 登録/更新 ボタンを配置 */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-blue-800">
            {formatDateJa(date)}
            <span className="ml-2 text-sm font-medium text-gray-500">
              勤務記録
            </span>
          </h3>
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "保存中..." : entry ? "更新" : "登録"}
          </button>
        </div>

        {/* 勤務時間。出勤・退勤・休憩を1行(3カラム)に。iOS Safari の time 入力は
            内容幅に広がりやすいため、各セルに min-w-0、入力は横パディングを詰めて
            はみ出し・重なりを防ぐ。 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-600">
              出勤
            </label>
            <input
              name="start_time"
              type="time"
              required
              defaultValue={init?.start_time ?? "10:00"}
              className={timeInputClass}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-600">
              退勤
            </label>
            <input
              name="end_time"
              type="time"
              required
              defaultValue={init?.end_time ?? "18:00"}
              className={timeInputClass}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-600">
              休憩(分)
            </label>
            <input
              name="break_minutes"
              type="number"
              min={0}
              step={5}
              required
              defaultValue={init?.break_minutes ?? 60}
              className={timeInputClass}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-gray-500">
          ※ 深夜勤務で退勤が翌日になる場合は、退勤にその時刻(例: 2:00)をそのまま入力してください。翌日ぶんとして計算します。
        </p>

        {/* 交通費(1つの枠にまとめる。塗りを少し濃く + 右上に×クリア) */}
        <fieldset className="rounded-xl border border-gray-200 bg-gray-100 p-3 pt-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="px-1 text-base font-semibold text-gray-700">
              交通費
            </span>
            <button
              type="button"
              onClick={clearTransport}
              aria-label="交通費をクリア"
              title="交通費をクリア"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 active:opacity-70"
            >
              ✕
            </button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  手段
                </label>
                <select
                  ref={modeRef}
                  name="transport_mode"
                  defaultValue={init?.transport_mode ?? "鉄道"}
                  className={inputClass}
                >
                  <option value="">選択</option>
                  {TRANSPORT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  金額(円)
                </label>
                <input
                  ref={costRef}
                  name="transport_cost"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10}
                  defaultValue={init?.transport_cost ?? 0}
                  onInput={() => costRef.current?.setCustomValidity("")}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  区間(駅1)
                </label>
                <input
                  ref={fromRef}
                  name="station_from"
                  list="station-list"
                  defaultValue={init?.station_from ?? ""}
                  placeholder="例: 大波駅"
                  onInput={() => fromRef.current?.setCustomValidity("")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  区間(駅2)
                </label>
                <input
                  ref={toRef}
                  name="station_to"
                  list="station-list"
                  defaultValue={init?.station_to ?? ""}
                  placeholder="例: 新世界駅"
                  onInput={() => toRef.current?.setCustomValidity("")}
                  className={inputClass}
                />
              </div>
            </div>
            <datalist id="station-list">
              {stations.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-600">
                片道 / 往復
              </span>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="round_trip"
                    value="on"
                    defaultChecked={init?.round_trip ?? true}
                    className="h-4 w-4"
                  />
                  往復
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="round_trip"
                    value="off"
                    defaultChecked={init ? !init.round_trip : false}
                    className="h-4 w-4"
                  />
                  片道
                </label>
              </div>
            </div>
          </div>
        </fieldset>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">
            メモ(任意)
          </label>
          <input
            name="note"
            defaultValue={entry?.note ?? ""}
            className={inputClass}
          />
        </div>

        {entry && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => onDelete(date)}
              className="rounded-lg border border-red-200 px-4 py-2.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              削除
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
