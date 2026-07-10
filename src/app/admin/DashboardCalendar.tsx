"use client";

import { useMemo, useState } from "react";
import {
  WEEKDAYS,
  datesInPeriod,
  formatMinutes,
  type Period,
} from "@/lib/period";

export type DayPerson = {
  employee_id: string;
  name: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  minutes: number;
  transport: number;
};

/**
 * ダッシュボード上部のカレンダー。
 * - 各日には勤務した人数だけドットを表示
 * - 日をクリックすると右側にその日の勤務者一覧(氏名・勤務時刻・勤務時間・交通費)を表示
 */
export function DashboardCalendar({
  period,
  personsByDate,
  holidays,
  today,
}: {
  period: Period;
  personsByDate: Record<string, DayPerson[]>;
  holidays: Record<string, string>;
  today: string;
}) {
  const dates = useMemo(() => datesInPeriod(period), [period]);
  const [selected, setSelected] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const rows: (string | null)[][] = [];
    let week: (string | null)[] = [];
    const firstDow = new Date(dates[0] + "T00:00:00Z").getUTCDay();
    for (let i = 0; i < firstDow; i++) week.push(null);
    for (const d of dates) {
      week.push(d);
      if (week.length === 7) {
        rows.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return rows;
  }, [dates]);

  const selectedPersons = selected ? (personsByDate[selected] ?? []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
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
              const persons = personsByDate[date] ?? [];
              const count = persons.length;
              const day = Number(date.slice(8, 10));
              const isSelected = selected === date;
              const isToday = date === today;
              const isHoliday = !!holidays[date];
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
                  onClick={() => setSelected(isSelected ? null : date)}
                  title={holidays[date] ?? undefined}
                  className={`m-0.5 flex min-h-14 flex-col items-center rounded-lg p-1 text-sm transition ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : count > 0
                        ? "bg-blue-50 text-blue-900"
                        : isToday
                          ? "bg-gray-100"
                          : "hover:bg-gray-50"
                  } ${isToday && !isSelected ? "ring-2 ring-gray-400" : ""}`}
                >
                  <span className={textColor}>{day}</span>
                  {count > 0 && (
                    <span className="mt-1 flex max-w-full flex-wrap items-center justify-center gap-0.5">
                      {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
                        <span
                          key={i}
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            isSelected ? "bg-blue-100" : "bg-blue-500"
                          }`}
                        />
                      ))}
                      {count > 8 && (
                        <span
                          className={`text-[10px] leading-none ${isSelected ? "text-blue-100" : "text-blue-600"}`}
                        >
                          +{count - 8}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 右側: 選択日の勤務者一覧 */}
      <div className="lg:sticky lg:top-20">
        {!selected ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white/50 p-8 text-center text-sm text-gray-400">
            カレンダーの日付を選ぶと、その日に勤務した人が表示されます
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-base font-bold text-blue-800">
              {formatDateJa(selected)}
              <span className="ml-2 text-sm font-normal text-gray-500">
                {selectedPersons.length}名
              </span>
            </h3>
            {selectedPersons.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">
                この日の勤務入力はありません
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {selectedPersons.map((p) => (
                  <li
                    key={p.employee_id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <span className="text-gray-600">
                      {p.start}〜{p.end}
                      <span className="ml-2 text-gray-500">
                        {formatMinutes(p.minutes) || "0時間"}
                      </span>
                      <span className="ml-2 text-gray-500">
                        ¥{p.transport.toLocaleString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
