"use client";

import { useMemo, useState, useTransition } from "react";
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
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function TimesheetCalendar({
  period,
  entries,
  closed,
}: {
  period: Period;
  entries: WorkEntry[];
  closed: boolean;
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
    <div className="space-y-4">
      {/* 期間ナビ */}
      <div className="flex items-center justify-between">
        <button
          onClick={() =>
            router.push(`/timesheet?p=${adjacentPeriodKey(period.key, -1)}`)
          }
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          ← 前月
        </button>
        <div className="text-center">
          <div className="font-bold">{period.label}</div>
          <div className="text-xs text-gray-500">
            {period.start.replaceAll("-", "/")} 〜{" "}
            {period.end.replaceAll("-", "/")}
          </div>
        </div>
        <button
          onClick={() =>
            router.push(`/timesheet?p=${adjacentPeriodKey(period.key, 1)}`)
          }
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          翌月 →
        </button>
      </div>

      {closed && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          この期間は締め済みのため入力・修正できません
        </p>
      )}

      {/* サマリ */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">勤務日数</div>
          <div className="text-lg font-bold">{summary.days}日</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">勤務時間</div>
          <div className="text-lg font-bold">
            {formatMinutes(summary.minutes) || "0時間"}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">交通費</div>
          <div className="text-lg font-bold">
            ¥{summary.transport.toLocaleString()}
          </div>
        </div>
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
              return (
                <button
                  key={date}
                  onClick={() => {
                    setResult(null);
                    setSelected(isSelected ? null : date);
                  }}
                  className={`m-0.5 flex min-h-14 flex-col items-center rounded-lg p-1 text-sm transition ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : entry
                        ? "bg-blue-50 text-blue-900"
                        : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`${di === 0 && !isSelected ? "text-red-500" : ""} ${di === 6 && !isSelected ? "text-blue-500" : ""}`}
                  >
                    {day}
                  </span>
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

      {/* 入力フォーム */}
      {selected && !closed && (
        <EntryForm
          key={selected}
          date={selected}
          entry={selectedEntry}
          defaults={lastEntry}
          pending={pending}
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
  onSave,
  onDelete,
}: {
  date: string;
  entry: WorkEntry | undefined;
  defaults: WorkEntry | null;
  pending: boolean;
  onSave: (fd: FormData) => void;
  onDelete: (date: string) => void;
}) {
  const init = entry ?? defaults;

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4">
      <h3 className="font-semibold">{formatDateJa(date)}</h3>
      <form action={onSave} className="mt-3 space-y-3">
        <input type="hidden" name="work_date" value={date} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              出勤
            </label>
            <input
              name="start_time"
              type="time"
              required
              defaultValue={init?.start_time ?? "09:00"}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              退勤
            </label>
            <input
              name="end_time"
              type="time"
              required
              defaultValue={init?.end_time ?? "17:00"}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
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
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              交通費(円)
            </label>
            <input
              name="transport_cost"
              type="number"
              min={0}
              required
              defaultValue={init?.transport_cost ?? 0}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
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
