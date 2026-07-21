"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period";
import { adjacentPeriodKey, datesInPeriod } from "@/lib/period";
import { useSwipeNav } from "@/lib/useSwipeNav";
import {
  SLOT_KEYS,
  SHIFT_TEXT_COLOR,
  customTimeParen,
  nicknameStyle,
  shiftNoteLabel,
  slotHourRangeLabel,
  type NicknameStyle,
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
  custom_start: string | null;
  custom_end: string | null;
};

/** 表示名: ニックネーム優先、無ければ氏名 */
function displayName(m: RosterMember): string {
  return m.nickname?.trim() || m.name;
}

/** ニックネームの表示区分(nicknameStyle)から className/文字色を組み立てる */
function nicknameClass(style: NicknameStyle): string {
  if (style === "match") return "font-bold";
  if (style === "mismatch") return "font-bold text-red-600";
  return "";
}
function nicknameColor(style: NicknameStyle): string | undefined {
  if (style === "match") return "#000";
  if (style === "mismatch") return undefined; // text-red-600 が優先
  return SHIFT_TEXT_COLOR;
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
  /** `${employee_id}|${work_date}` -> status。ニックネームのフォント表示に使う(nicknameStyle参照) */
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
    custom_start?: string;
    custom_end?: string;
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

  // `${empId}|${date}` -> slot / 変則出勤・退勤予定
  const slotByKey = useMemo(() => {
    const m = new Map<string, SlotKey>();
    for (const a of assignments) m.set(`${a.employee_id}|${a.work_date}`, a.slot);
    return m;
  }, [assignments]);
  const customByKey = useMemo(() => {
    const m = new Map<string, { start: string | null; end: string | null }>();
    for (const a of assignments)
      m.set(`${a.employee_id}|${a.work_date}`, {
        start: a.custom_start,
        end: a.custom_end,
      });
    return m;
  }, [assignments]);

  // 日付 -> 枠 -> {メンバー, 変則時刻}配列
  const byDate = useMemo(() => {
    const m = new Map<
      string,
      Record<
        SlotKey,
        { member: RosterMember; customStart: string | null; customEnd: string | null }[]
      >
    >();
    for (const a of assignments) {
      const member = memberById.get(a.employee_id);
      if (!member) continue;
      if (!m.has(a.work_date)) m.set(a.work_date, { A: [], B: [], C: [] });
      m.get(a.work_date)![a.slot].push({
        member,
        customStart: a.custom_start,
        customEnd: a.custom_end,
      });
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
  // カレンダーの左右スワイプで前後の月へ移動
  const swipeHandlers = useSwipeNav(
    () => router.push(periodHref(1)),
    () => router.push(periodHref(-1))
  );

  function runAssign(
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    customStart?: string,
    customEnd?: string
  ) {
    if (!editable || !assign || !clear) return;
    startTransition(async () => {
      const res = slot
        ? await assign({
            employee_id: employeeId,
            work_date: workDate,
            slot,
            custom_start: customStart,
            custom_end: customEnd,
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
          <span className="ml-auto text-lg font-bold text-gray-700">
            シフト予定
          </span>
        </div>

        {editable && (
          <p className="text-xs font-medium text-gray-800">
            日をタップしてシフトを指定してください
          </p>
        )}

        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}

        {/* カレンダー(左右スワイプで前後の月に移動) */}
        <div
          className="rounded-xl border-2 border-gray-400 bg-white p-0.5 sm:p-2"
          {...swipeHandlers}
        >
          <div className="mb-0.5 grid grid-cols-7 rounded-lg bg-gray-100 text-center text-sm font-semibold text-gray-600 sm:mb-1">
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
                    className={`relative flex min-h-16 flex-col border border-gray-100 p-0 text-left align-top transition sm:min-h-20 ${
                      isSelected ? "z-10 ring-2 ring-blue-500" : "hover:bg-gray-50"
                    } ${isToday ? "bg-gray-100" : ""}`}
                  >
                    <div className="flex justify-center">
                      <span className={`text-base font-bold sm:text-lg ${textColor}`}>
                        {day}
                      </span>
                    </div>
                    {/* 縦位置で枠を表現(上段=早番/中段=遅番/下段=深夜)。各人を横幅いっぱいの色帯で表示。
                        名前が5文字程度まで収まるよう余白を最小限にする(隣のセルと接触してもよい)。 */}
                    <div className="flex flex-1 flex-col gap-px">
                      {SLOT_KEYS.map((k) => (
                        <div key={k} className="flex min-h-[15px] flex-col gap-px">
                          {(slotsForDay?.[k] ?? []).map(
                            ({ member: m, customStart, customEnd }) => {
                              const style = nicknameStyle(
                                statusMap[`${m.id}|${date}`]
                              );
                              const note = shiftNoteLabel(customStart, customEnd);
                              return (
                                <span
                                  key={m.id}
                                  className={`block w-full truncate text-[9px] leading-tight sm:text-[10px] ${nicknameClass(style)}`}
                                  style={{
                                    backgroundColor: m.color ?? "#eef2f7",
                                    color: nicknameColor(style),
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
                            }
                          )}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* シフト枠の時刻一覧(1行) + 補足説明。従業員・管理者どちらの画面にも表示する */}
        <p className="text-xs text-gray-600">
          {SLOT_KEYS.map((k, i) => (
            <span key={k}>
              {i > 0 && "、"}
              {slots[k].label} {slotHourRangeLabel(slots[k])}
            </span>
          ))}
        </p>
        <p className="text-xs font-medium">
          <span className="text-gray-800">太字＝実績入力済み。</span>
          <span className="text-red-600">赤太字＝予定と実績が相違</span>
        </p>
      </div>

      {/* 右カラム(スマホでは下): 選択日の詳細 / 編集 */}
      <div className="lg:sticky lg:top-20">
        {selected ? (
          <DayPanel
            date={selected}
            slots={slots}
            roster={roster}
            slotByKey={slotByKey}
            customByKey={customByKey}
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

/** 予定編集の1行(枠ボタン＋任意の変則出勤/退勤予定)。 */
function EditRow({
  member: m,
  date,
  slots,
  cur,
  customStart,
  customEnd,
  style,
  pending,
  onAssign,
}: {
  member: RosterMember;
  date: string;
  slots: Record<SlotKey, SlotDef>;
  cur: SlotKey | null;
  customStart: string | null;
  customEnd: string | null;
  style: NicknameStyle;
  pending: boolean;
  onAssign: (
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    customStart?: string,
    customEnd?: string
  ) => void;
}) {
  const [cs, setCs] = useState(customStart ?? "");
  const [ce, setCe] = useState(customEnd ?? "");

  return (
    <div className="border-b border-gray-50 py-1">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`min-w-0 flex-1 truncate rounded px-2 py-0.5 text-sm ${nicknameClass(style)}`}
          style={{
            backgroundColor: m.color ?? "#eef2f7",
            color: nicknameColor(style),
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
                onAssign(m.id, date, cur === k ? null : k, cs, ce)
              }
              className={`h-7 rounded-lg border px-2 text-xs font-bold transition disabled:opacity-50 ${
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
      {/* 変則勤務時間(任意)。枠が割当済みのときだけ表示。変更がある場合のみ入力。
          見出しは入力欄と同じ行、入力欄のすぐ左に配置する。 */}
      {cur && (
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="text-xs font-semibold text-gray-500">
            変則勤務時間
          </span>
          <input
            value={cs}
            onChange={(e) => setCs(e.target.value)}
            onBlur={() => {
              if (cs !== (customStart ?? ""))
                onAssign(m.id, date, cur, cs, ce);
            }}
            placeholder={slots[cur].start}
            maxLength={5}
            disabled={pending}
            aria-label="変則出勤予定"
            className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">〜</span>
          <input
            value={ce}
            onChange={(e) => setCe(e.target.value)}
            onBlur={() => {
              if (ce !== (customEnd ?? "")) onAssign(m.id, date, cur, cs, ce);
            }}
            placeholder={slots[cur].end}
            maxLength={5}
            disabled={pending}
            aria-label="変則退勤予定"
            className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
  customByKey,
  statusMap,
  editable,
  pending,
  onAssign,
}: {
  date: string;
  slots: Record<SlotKey, SlotDef>;
  roster: RosterMember[];
  slotByKey: Map<string, SlotKey>;
  customByKey: Map<string, { start: string | null; end: string | null }>;
  statusMap: Record<string, ShiftStatus>;
  editable: boolean;
  pending: boolean;
  onAssign: (
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    customStart?: string,
    customEnd?: string
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
        <div className="mt-3 grid grid-cols-[3.5rem_auto_1fr] items-baseline gap-x-3 gap-y-2">
          {SLOT_KEYS.flatMap((k) => {
            const members = roster.filter(
              (m) => slotByKey.get(`${m.id}|${date}`) === k
            );
            return members.map((m) => {
              const style = nicknameStyle(statusMap[`${m.id}|${date}`]);
              const c = customByKey.get(`${m.id}|${date}`);
              const paren = customTimeParen(c?.start ?? null, c?.end ?? null);
              return (
                <Fragment key={`${k}-${m.id}`}>
                  <span className="text-base font-bold text-gray-700 sm:text-lg">
                    {slots[k].label}
                  </span>
                  <span
                    className={`truncate text-base sm:text-lg ${nicknameClass(style)}`}
                    style={{ color: nicknameColor(style) }}
                  >
                    {displayName(m)}
                  </span>
                  <span className="text-sm text-gray-500 sm:text-base">
                    {paren}
                  </span>
                </Fragment>
              );
            });
          })}
          {SLOT_KEYS.every((k) =>
            roster.every((m) => slotByKey.get(`${m.id}|${date}`) !== k)
          ) && (
            <span className="col-span-3 text-sm text-gray-300">
              この日のシフト予定はありません
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {roster.length === 0 && (
            <p className="text-sm text-gray-400">対象の従業員がいません。</p>
          )}
          {roster.map((m) => {
            const c = customByKey.get(`${m.id}|${date}`);
            return (
              <EditRow
                key={m.id}
                member={m}
                date={date}
                slots={slots}
                cur={slotByKey.get(`${m.id}|${date}`) ?? null}
                customStart={c?.start ?? null}
                customEnd={c?.end ?? null}
                style={nicknameStyle(statusMap[`${m.id}|${date}`])}
                pending={pending}
                onAssign={onAssign}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
