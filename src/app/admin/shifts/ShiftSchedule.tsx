"use client";

import { useMemo, useState, useTransition } from "react";
// useState は EditRow でも使用
import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period";
import { adjacentPeriodKey, datesInPeriod } from "@/lib/period";
import {
  SLOT_KEYS,
  SHIFT_TEXT_COLOR,
  isMismatch,
  slotRangeLabel,
  type SlotDef,
  type SlotKey,
  type ShiftStatus,
} from "@/lib/shifts";
import type { ActionResult } from "./actions";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export type RosterMember = {
  id: string;
  name: string;
  nickname: string | null;
  color: string | null;
};
export type Assignment = {
  employee_id: string;
  work_date: string;
  slot: SlotKey;
  note: string | null;
};

/** 表示名: ニックネーム優先、無ければ氏名 */
function displayName(m: RosterMember): string {
  return m.nickname?.trim() || m.name;
}

export function ShiftSchedule({
  period,
  slots,
  roster,
  assignments,
  statusMap,
  holidays,
  today,
  basePath,
  editable = false,
  assign,
  clear,
}: {
  period: Period;
  slots: Record<SlotKey, SlotDef>;
  roster: RosterMember[];
  assignments: Assignment[];
  /** `${employee_id}|${work_date}` -> status。match 以外は予実相違(赤太字) */
  statusMap: Record<string, ShiftStatus>;
  holidays: Record<string, string>;
  today: string;
  /** 期間ナビのリンク先ベース("/admin" または "/shifts") */
  basePath: string;
  editable?: boolean;
  assign?: (input: {
    employee_id: string;
    work_date: string;
    slot: string;
    note?: string;
  }) => Promise<ActionResult>;
  clear?: (employeeId: string, workDate: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const memberById = useMemo(
    () => new Map(roster.map((m) => [m.id, m] as const)),
    [roster]
  );

  // `${empId}|${date}` -> slot / note
  const slotByKey = useMemo(() => {
    const m = new Map<string, SlotKey>();
    for (const a of assignments) m.set(`${a.employee_id}|${a.work_date}`, a.slot);
    return m;
  }, [assignments]);
  const noteByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments)
      if (a.note) m.set(`${a.employee_id}|${a.work_date}`, a.note);
    return m;
  }, [assignments]);

  // 日付 -> 枠 -> {メンバー, メモ}配列
  const byDate = useMemo(() => {
    const m = new Map<
      string,
      Record<SlotKey, { member: RosterMember; note: string | null }[]>
    >();
    for (const a of assignments) {
      const member = memberById.get(a.employee_id);
      if (!member) continue;
      if (!m.has(a.work_date)) m.set(a.work_date, { A: [], B: [], C: [] });
      m.get(a.work_date)![a.slot].push({ member, note: a.note });
    }
    return m;
  }, [assignments, memberById]);

  const dates = useMemo(() => datesInPeriod(period), [period]);
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

  function periodHref(delta: 1 | -1) {
    return `${basePath}?p=${adjacentPeriodKey(period.key, delta)}`;
  }

  function runAssign(
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    note?: string
  ) {
    if (!editable || !assign || !clear) return;
    startTransition(async () => {
      const res = slot
        ? await assign({
            employee_id: employeeId,
            work_date: workDate,
            slot,
            note,
          })
        : await clear(employeeId, workDate);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
      <div className="space-y-4">
        {/* 期間ナビ */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push(periodHref(-1))}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </button>
          <span className="text-xl font-extrabold tracking-tight text-blue-800">
            {period.label}
          </span>
          <button
            onClick={() => router.push(periodHref(1))}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-2xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </button>
          <span className="ml-auto text-sm font-semibold text-gray-500">
            シフト予定
          </span>
        </div>

        {/* 枠の凡例 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {SLOT_KEYS.map((k) => (
            <span key={k} className="whitespace-nowrap">
              <span className="font-bold text-gray-800">{slots[k].label}</span>{" "}
              {slotRangeLabel(slots[k])}
            </span>
          ))}
          <span className="whitespace-nowrap font-medium text-red-600">
            赤太字＝予定と実績が相違
          </span>
        </div>

        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}

        {/* カレンダー */}
        <div className="rounded-xl border-2 border-gray-400 bg-white p-2">
          <div className="mb-1 grid grid-cols-7 rounded-lg bg-gray-100 text-center text-xs font-semibold text-gray-600">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}
              >
                {w}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((date, di) => {
                if (!date) return <div key={di} />;
                const day = Number(date.slice(8, 10));
                const isSelected = selected === date;
                const isToday = date === today;
                const isHoliday = !!holidays[date];
                const textColor =
                  isHoliday || di === 0
                    ? "text-red-500"
                    : di === 6
                      ? "text-blue-500"
                      : "text-gray-700";
                const slotsForDay = byDate.get(date);
                return (
                  <button
                    key={date}
                    onClick={() => setSelected(isSelected ? null : date)}
                    title={holidays[date] ?? undefined}
                    className={`m-0.5 flex min-h-24 flex-col rounded-lg p-1 text-left align-top transition ${
                      isSelected ? "ring-2 ring-blue-500" : "hover:bg-gray-50"
                    } ${isToday ? "bg-gray-100" : ""}`}
                  >
                    <div className="flex justify-end">
                      <span className={`text-xs font-semibold ${textColor}`}>
                        {day}
                      </span>
                    </div>
                    {/* 縦位置で枠を表現(上段=早番/中段=遅番/下段=深夜)。各人を横幅いっぱいの色帯で表示。 */}
                    <div className="mt-0.5 flex flex-1 flex-col gap-px">
                      {SLOT_KEYS.map((k) => (
                        <div key={k} className="flex min-h-[15px] flex-col gap-px">
                          {(slotsForDay?.[k] ?? []).map(({ member: m, note }) => {
                            const mism = isMismatch(statusMap[`${m.id}|${date}`]);
                            return (
                              <span
                                key={m.id}
                                className={`block w-full truncate rounded-sm px-1 text-[10px] leading-tight ${
                                  mism ? "font-bold text-red-600" : ""
                                }`}
                                style={{
                                  backgroundColor: m.color ?? "#eef2f7",
                                  color: mism ? undefined : SHIFT_TEXT_COLOR,
                                }}
                                title={`${slots[k].label}: ${m.name}${note ? ` ${note}` : ""}`}
                              >
                                {displayName(m)}
                                {note && (
                                  <span className="ml-0.5 font-normal opacity-80">
                                    {note}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 右カラム(スマホでは下): 選択日の詳細 / 編集 */}
      <div className="lg:sticky lg:top-20">
        {selected ? (
          <DayPanel
            date={selected}
            slots={slots}
            roster={roster}
            slotByKey={slotByKey}
            noteByKey={noteByKey}
            statusMap={statusMap}
            editable={editable}
            pending={pending}
            onAssign={runAssign}
          />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            日付を選ぶと、その日のシフト
            {editable ? "を編集できます。" : "を確認できます。"}
          </div>
        )}
      </div>
    </div>
  );
}

/** 予定編集の1行(枠ボタン＋任意メモ)。メモはローカル状態で持ち、確定時に割当と一緒に保存する。 */
function EditRow({
  member: m,
  date,
  slots,
  cur,
  note,
  mism,
  pending,
  onAssign,
}: {
  member: RosterMember;
  date: string;
  slots: Record<SlotKey, SlotDef>;
  cur: SlotKey | null;
  note: string;
  mism: boolean;
  pending: boolean;
  onAssign: (
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    note?: string
  ) => void;
}) {
  const [noteValue, setNoteValue] = useState(note);

  return (
    <div className="border-b border-gray-50 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`min-w-0 flex-1 truncate rounded px-2 py-0.5 text-sm ${mism ? "font-bold text-red-600" : ""}`}
          style={{
            backgroundColor: m.color ?? "#eef2f7",
            color: mism ? undefined : SHIFT_TEXT_COLOR,
          }}
          title={m.name}
        >
          {displayName(m)}
        </span>
        <div className="flex shrink-0 gap-1">
          {SLOT_KEYS.map((k) => (
            <button
              key={k}
              disabled={pending}
              onClick={() =>
                onAssign(m.id, date, cur === k ? null : k, noteValue)
              }
              className={`h-8 rounded-lg border px-2 text-xs font-bold transition disabled:opacity-50 ${
                cur === k
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {slots[k].label}
            </button>
          ))}
        </div>
      </div>
      {/* メモ(任意)。枠が割当済みのときだけ表示。入力後フォーカスを外すと保存。 */}
      {cur && (
        <div className="mt-1 flex items-center gap-2 pl-1">
          <span className="text-xs text-gray-400">メモ</span>
          <input
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={() => {
              if (noteValue !== note) onAssign(m.id, date, cur, noteValue);
            }}
            placeholder="例: 〜16"
            maxLength={30}
            disabled={pending}
            className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
}

function formatDateJa(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS[d.getUTCDay()]})`;
}

function DayPanel({
  date,
  slots,
  roster,
  slotByKey,
  noteByKey,
  statusMap,
  editable,
  pending,
  onAssign,
}: {
  date: string;
  slots: Record<SlotKey, SlotDef>;
  roster: RosterMember[];
  slotByKey: Map<string, SlotKey>;
  noteByKey: Map<string, string>;
  statusMap: Record<string, ShiftStatus>;
  editable: boolean;
  pending: boolean;
  onAssign: (
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    note?: string
  ) => void;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4">
      <h3 className="text-lg font-bold text-blue-800">
        {formatDateJa(date)}
        <span className="ml-2 text-sm font-medium text-gray-500">
          シフト{editable ? "編集" : "予定"}
        </span>
      </h3>

      {!editable ? (
        <div className="mt-3 space-y-3">
          {SLOT_KEYS.map((k) => {
            const members = roster.filter(
              (m) => slotByKey.get(`${m.id}|${date}`) === k
            );
            return (
              <div key={k}>
                <div className="text-xs font-semibold text-gray-500">
                  {slots[k].label} {slotRangeLabel(slots[k])}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {members.length === 0 ? (
                    <span className="text-xs text-gray-300">—</span>
                  ) : (
                    members.map((m) => {
                      const mism = isMismatch(statusMap[`${m.id}|${date}`]);
                      const note = noteByKey.get(`${m.id}|${date}`);
                      return (
                        <span
                          key={m.id}
                          className={`rounded px-2 py-0.5 text-sm ${mism ? "font-bold text-red-600" : ""}`}
                          style={{
                            backgroundColor: m.color ?? "#eef2f7",
                            color: mism ? undefined : SHIFT_TEXT_COLOR,
                          }}
                        >
                          {displayName(m)}
                          {note && (
                            <span className="ml-1 font-normal opacity-80">
                              {note}
                            </span>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">
            各従業員の枠を選びます(もう一度押すと解除)。
          </p>
          {roster.length === 0 && (
            <p className="text-sm text-gray-400">対象の従業員がいません。</p>
          )}
          {roster.map((m) => (
            <EditRow
              key={m.id}
              member={m}
              date={date}
              slots={slots}
              cur={slotByKey.get(`${m.id}|${date}`) ?? null}
              note={noteByKey.get(`${m.id}|${date}`) ?? ""}
              mism={isMismatch(statusMap[`${m.id}|${date}`])}
              pending={pending}
              onAssign={onAssign}
            />
          ))}
        </div>
      )}
    </div>
  );
}
