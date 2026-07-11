"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  WEEKDAYS,
  adjacentPeriodKey,
  formatMinutes,
  formatRoute,
  periodFromKey,
  weekdayOf,
  workMinutes,
} from "@/lib/period";

export type HoursEntry = {
  work_date: string;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  break_minutes: number;
  transport_cost: number;
  transport_mode: string | null;
  station_from: string | null;
  station_to: string | null;
  round_trip: boolean;
};

export type EmployeeHours = {
  id: string;
  employee_no: string;
  name: string;
  entries: HoursEntry[];
};

export function HoursView({
  periodKey,
  workers,
}: {
  periodKey: string;
  workers: EmployeeHours[];
}) {
  const period = periodFromKey(periodKey)!;
  const [selectedId, setSelectedId] = useState<string | null>(
    workers[0]?.id ?? null
  );

  const selected = useMemo(
    () => workers.find((w) => w.id === selectedId) ?? null,
    [workers, selectedId]
  );

  return (
    <div className="space-y-4">
      {/* タイトル行(ダッシュボードと同じ表現に統一) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm font-medium text-gray-500">勤務時間</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900">
              {period.label}
            </span>
            <div className="flex gap-2 text-sm">
              <Link
                href={`/admin/hours?p=${adjacentPeriodKey(period.key, -1)}`}
                className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-200"
              >
                ← 前月
              </Link>
              <Link
                href={`/admin/hours?p=${adjacentPeriodKey(period.key, 1)}`}
                className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-200"
              >
                翌月 →
              </Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {period.start.replaceAll("-", "/")} 〜{" "}
            {period.end.replaceAll("-", "/")}
          </p>
        </div>
      </div>

      {workers.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          この年月に勤務した従業員はいません。
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(9rem,14rem)_1fr] md:items-start">
          {/* 左: 従業員リスト */}
          <nav className="rounded-xl border border-gray-200 bg-white p-2">
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {workers.map((w) => {
                const active = w.id === selectedId;
                return (
                  <li key={w.id} className="shrink-0 md:shrink">
                    <button
                      onClick={() => setSelectedId(w.id)}
                      className={`w-full touch-manipulation whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition active:opacity-70 ${
                        active
                          ? "bg-blue-600 font-semibold text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {w.name}
                      <span
                        className={`ml-1.5 text-xs ${active ? "text-blue-100" : "text-gray-400"}`}
                      >
                        {w.entries.length}日
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* 右: 選択従業員の1ヶ月の勤務一覧 */}
          <div className="min-w-0">
            {selected && <EmployeeMonth employee={selected} />}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeMonth({ employee }: { employee: EmployeeHours }) {
  const totals = employee.entries.reduce(
    (acc, e) => {
      acc.minutes += workMinutes(e.start_time, e.end_time, e.break_minutes);
      acc.transport += e.transport_cost;
      return acc;
    },
    { minutes: 0, transport: 0 }
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h2 className="text-lg font-bold text-gray-900">{employee.name}</h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-gray-600">
          <span>
            勤務日数{" "}
            <span className="font-bold text-gray-900">
              {employee.entries.length}日
            </span>
          </span>
          <span>
            勤務時間{" "}
            <span className="font-bold text-gray-900">
              {formatMinutes(totals.minutes) || "0時間"}
            </span>
          </span>
          <span>
            交通費{" "}
            <span className="font-bold text-gray-900">
              ¥{totals.transport.toLocaleString()}
            </span>
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-blue-200 bg-blue-100 text-left text-xs font-semibold text-gray-700">
              <th className="px-3 py-2">年月日</th>
              <th className="px-2 py-2">曜日</th>
              <th className="px-2 py-2">開始</th>
              <th className="px-1 py-2"></th>
              <th className="px-2 py-2">終了</th>
              <th className="px-3 py-2 text-right">勤務時間</th>
              <th className="px-3 py-2">交通手段</th>
              <th className="px-3 py-2">区間</th>
              <th className="px-3 py-2 text-right">交通費</th>
            </tr>
          </thead>
          <tbody>
            {employee.entries.map((e) => {
              const dow = weekdayOf(e.work_date);
              const minutes = workMinutes(
                e.start_time,
                e.end_time,
                e.break_minutes
              );
              const route = formatRoute(
                e.station_from,
                e.station_to,
                e.round_trip
              );
              return (
                <tr key={e.work_date} className="border-b border-gray-50">
                  <td className="px-3 py-2">
                    {e.work_date.replaceAll("-", "/")}
                  </td>
                  <td
                    className={`px-2 py-2 ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-600"}`}
                  >
                    {WEEKDAYS[dow]}
                  </td>
                  <td className="px-2 py-2">{e.start_time}</td>
                  <td className="px-1 py-2 text-gray-400">〜</td>
                  <td className="px-2 py-2">{e.end_time}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMinutes(minutes) || "0時間"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {e.transport_mode ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{route || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    ¥{e.transport_cost.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
