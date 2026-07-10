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
import { upsertWorkEntry, deleteWorkEntry, type ActionResult } from "./actions";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const inputClass =
  "w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const TRANSPORT_MODES = ["鉄道", "バス", "自転車", "その他"];

export function TimesheetCalendar({
  period,
  entries,
  closed,
  stations,
  holidays,
  today,
}: {
  period: Period;
  entries: WorkEntry[];
  closed: boolean;
  stations: string[];
  holidays: Record<string, string>;
  today: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

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
  // 入力の既定値: 直近の入力をコピー
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  function save(formData: FormData) {
    startTransition(async () => {
      const res = await upsertWorkEntry(formData);
      setResult(res);
      if (res.ok) {
        setSelected(null);
        router.refresh();
      }
    });
  }

  function remove(workDate: string) {
    startTransition(async () => {
      const res = await deleteWorkEntry(workDate);
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
        {/* 期間ナビ(月を大きく目立たせる) */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() =>
              router.push(`/timesheet?p=${adjacentPeriodKey(period.key, -1)}`)
            }
            aria-label="前月"
            className="shrink-0 rounded-lg px-3 py-1 text-3xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </button>
          <div className="text-center">
            <div className="text-3xl font-extrabold tracking-tight text-blue-800">
              {period.label}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {period.start.replaceAll("-", "/")} 〜{" "}
              {period.end.replaceAll("-", "/")}
            </div>
          </div>
          <button
            onClick={() =>
              router.push(`/timesheet?p=${adjacentPeriodKey(period.key, 1)}`)
            }
            aria-label="翌月"
            className="shrink-0 rounded-lg px-3 py-1 text-3xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </button>
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
                      setSelected(isSelected ? null : date);
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

      {/* 右カラム: 入力フォーム(PC/iPadでは右、スマホでは下) */}
      <div className="lg:sticky lg:top-20">
        {selected && !closed && (
          <EntryForm
            key={selected}
            date={selected}
            entry={selectedEntry}
            defaults={lastEntry}
            pending={pending}
            stations={stations}
            onSave={save}
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
        {!selected && (
          <div className="hidden rounded-xl border border-dashed border-gray-300 bg-white/50 p-8 text-center text-sm text-gray-400 lg:block">
            カレンダーの日付を選ぶと、ここに入力欄が表示されます
          </div>
        )}
      </div>
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
      <h3 className="text-lg font-bold text-blue-800">
        {formatDateJa(date)}
        <span className="ml-2 text-sm font-medium text-gray-500">勤務記録</span>
      </h3>
      <form ref={formRef} onSubmit={handleSubmit} className="mt-3 space-y-4">
        <input type="hidden" name="work_date" value={date} />

        {/* 勤務時間(出勤・退勤は間隔を広めに。[&>div]:min-w-0 で列の重なりを防ぐ) */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 [&>div]:min-w-0">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">
              出勤
            </label>
            <input
              name="start_time"
              type="time"
              required
              defaultValue={init?.start_time ?? "10:00"}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">
              退勤
            </label>
            <input
              name="end_time"
              type="time"
              required
              defaultValue={init?.end_time ?? "18:00"}
              className={inputClass}
            />
          </div>
          <div>
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
              className={inputClass}
            />
          </div>
        </div>

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

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "保存中..." : entry ? "更新する" : "登録する"}
          </button>
          {entry && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onDelete(date)}
              className="rounded-lg border border-red-200 px-4 py-2.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
