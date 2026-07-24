"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period";
import {
  adjacentPeriodKey,
  datesInPeriod,
  workMinutes,
  standardBreakMinutes,
  nightMinutes,
} from "@/lib/period";
import { useSwipeNav } from "@/lib/useSwipeNav";
import { DEFAULT_BREAK_WINDOWS, type BreakWindow } from "@/lib/breaks";
import type { ShiftInfo } from "@/lib/shifts";
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
  shifts = {},
  timeLocked = false,
  breakWindows = DEFAULT_BREAK_WINDOWS,
}: {
  period: Period;
  entries: WorkEntry[];
  closed: boolean;
  stations: string[];
  holidays: Record<string, string>;
  today: string;
  /** 表示中の従業員のシフト予定(work_date -> ShiftInfo)。予実一覧・入力デフォルトに使う */
  shifts?: Record<string, ShiftInfo>;
  /** 管理者が設定でロックした場合、従業員は出勤/退勤時刻・休憩時間を編集できない(管理者画面では常にfalse) */
  timeLocked?: boolean;
  /** 標準休憩時間帯(設定画面「休憩時間」で変更可)。勤務時間の表示計算に使う(保存時の実際の値はサーバー側で確定) */
  breakWindows?: BreakWindow[];
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
  // カレンダーの左右スワイプで前後の月へ移動
  const { blank: swipeBlank, attach: swipeAttach } = useSwipeNav(
    () => router.push(periodHref(1)),
    () => router.push(periodHref(-1)),
    period.key
  );

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
      // 退勤未入力の日は勤務時間に含めない(交通費・日数はカウント)
      if (e.end_time)
        minutes += workMinutes(
          e.start_time,
          e.end_time,
          standardBreakMinutes(e.start_time, e.end_time, breakWindows)
        );
      transport += e.transport_cost;
    }
    return { days: entries.length, minutes, transport };
  }, [entries, breakWindows]);

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
              <span className="block truncate text-right text-lg font-bold text-gray-700">
                勤務実績
              </span>
            ) : null}
          </div>
        </div>

        {closed && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            この期間は締め済みのため入力・修正できません
          </p>
        )}

        {/* サマリ(枠内)。タップするとカレンダー下の表示を「勤務一覧」に切り替える */}
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setSelected(null);
          }}
          title="タップで勤務一覧を表示"
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-left transition hover:bg-gray-50"
        >
          {/* iPhone でも1行に収まるよう「計」+ h:mm、キャプションはsm以上のみ表示 */}
          <div className="flex flex-nowrap items-baseline gap-x-3 whitespace-nowrap text-base text-gray-600">
            <span className="font-semibold text-gray-700">計</span>
            <span className="font-bold text-gray-900">{summary.days}日</span>
            <span className="font-bold text-gray-900 tabular-nums">
              {hhmm(summary.minutes)}
            </span>
            <span>
              交通費{" "}
              <span className="font-bold text-gray-900 tabular-nums">
                ¥{summary.transport.toLocaleString()}
              </span>
            </span>
            <span className="ml-auto text-xs text-blue-600">一覧</span>
          </div>
        </button>

        {result && !result.ok && (
          <p className="text-sm text-red-600">{result.message}</p>
        )}

        {/* カレンダー(左右スワイプで前後の月に移動)。外枠でスライドアウトをクリップする */}
        <div className="overflow-hidden">
        <div
          ref={swipeAttach}
          className="rounded-xl border-2 border-gray-400 bg-white p-2"
        >
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
                // スワイプ中は前月の予定が残って見えないよう中身を白紙にする
                const entry = swipeBlank ? undefined : entryMap.get(date);
                const shift = shifts[date];
                // 予実一覧と同じ判定: 予定と実績の相違(予定外勤務含む)は赤太字にする
                const unplanned = !!entry && !shift;
                const startDiff =
                  !!entry &&
                  (unplanned ||
                    (!!shift &&
                      !!shift.startInput &&
                      entry.start_time !== shift.startInput));
                const endDiff =
                  !!entry &&
                  (unplanned ||
                    (!!shift && (entry.end_time ?? "") !== (shift.endInput ?? "")));
                const startMatch =
                  !!entry &&
                  !!shift &&
                  !!shift.startInput &&
                  entry.start_time === shift.startInput;
                const endMatch =
                  !!entry &&
                  !!shift &&
                  !!shift.endInput &&
                  !!entry.end_time &&
                  entry.end_time === shift.endInput;
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
                        <span
                          className={
                            startDiff
                              ? "font-bold text-red-600"
                              : startMatch && !isSelected
                                ? "font-bold text-gray-900"
                                : ""
                          }
                        >
                          {entry.start_time}
                        </span>
                        <br />
                        {entry.end_time ? (
                          <span
                            className={
                              endDiff
                                ? "font-bold text-red-600"
                                : endMatch && !isSelected
                                  ? "font-bold text-gray-900"
                                  : ""
                            }
                          >
                            {entry.end_time}
                          </span>
                        ) : (
                          <span
                            className={
                              isSelected
                                ? "rounded bg-amber-300/70 px-0.5 text-amber-900"
                                : "rounded bg-amber-200 px-0.5 text-amber-800"
                            }
                          >
                            退勤?
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
            shift={shifts[selected]}
            pending={pending}
            stations={stations}
            onSave={handleSave}
            onDelete={remove}
            timeLocked={timeLocked}
          />
        )}
        {selected && closed && selectedEntry && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h3 className="font-semibold">{formatDateJa(selected)}</h3>
            <p className="mt-2 text-gray-600">
              {selectedEntry.start_time}〜{selectedEntry.end_time}(休憩
              {selectedEntry.end_time
                ? standardBreakMinutes(
                    selectedEntry.start_time,
                    selectedEntry.end_time,
                    breakWindows
                  )
                : selectedEntry.break_minutes}
              分)/ 交通費 ¥
              {selectedEntry.transport_cost.toLocaleString()}
            </p>
          </div>
        )}
        {/* 未選択(締め済みで入力欄が出ない場合含む)は勤務一覧表を表示 */}
        {(!selected || (closed && !selectedEntry)) && (
          <WorkList
            entries={entries}
            holidays={holidays}
            shifts={shifts}
            breakWindows={breakWindows}
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
  const start = s("start_time");
  const end = s("end_time");
  return {
    work_date: s("work_date"),
    start_time: start,
    end_time: end,
    // 休憩は標準ルールから導出(入力欄は廃止)。ここはモジュール関数(コンポーネント外)のため
    // 設定済みの休憩枠を参照できず既定値を使うが、これは「次の新規日への既定値プレビュー」用の
    // 概算にすぎず、実際に保存される休憩時間はサーバー側で設定済みの休憩枠から確定計算される。
    break_minutes: end ? standardBreakMinutes(start, end) : 0,
    transport_cost: Number(s("transport_cost")) || 0,
    transport_mode: s("transport_mode") || null,
    station_from: s("station_from") || null,
    station_to: s("station_to") || null,
    round_trip: s("round_trip") === "on",
    note: s("note") || null,
  };
}

/**
 * カレンダー下(スマホ)/右(PC)の予実一覧。1日ごとに
 * 上段=シフト予定(青)・下段=勤務実績(緑)を色分けで表示し、日ごとに横線で区切る。
 * 予定と実績で時刻が相違する場合は実績側の該当時刻を赤太字にする。
 */
function WorkList({
  entries,
  holidays,
  shifts,
  breakWindows,
  onSelect,
}: {
  entries: WorkEntry[];
  holidays: Record<string, string>;
  shifts: Record<string, ShiftInfo>;
  breakWindows: BreakWindow[];
  onSelect: (workDate: string) => void;
}) {
  const entryMap = new Map(entries.map((e) => [e.work_date, e]));
  // 予定・実績のいずれかがある日をすべて対象にする
  const dateSet = new Set<string>([
    ...entries.map((e) => e.work_date),
    ...Object.keys(shifts),
  ]);
  const dates = [...dateSet].sort();

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-blue-100 bg-blue-50/70 px-3 py-2 text-sm font-semibold text-gray-700">
        <span>予実一覧</span>
        <span className="text-xs font-normal text-gray-500">
          上段:予定、下段:実績、予実不一致は
          <span className="font-bold text-red-600">赤字</span>
          。（）内:深夜
        </span>
      </div>
      {dates.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-gray-400">
          この月のシフト予定・勤務入力はまだありません。カレンダーの日付を選んで入力してください。
        </p>
      ) : (
        <ul>
          {dates.map((date) => {
            const e = entryMap.get(date);
            const shift = shifts[date];
            const d = new Date(date + "T00:00:00Z");
            const dow = d.getUTCDay();
            const dowColor =
              holidays[date] || dow === 0
                ? "text-red-500"
                : dow === 6
                  ? "text-blue-500"
                  : "text-gray-700";
            const mins =
              e && e.end_time
                ? workMinutes(
                    e.start_time,
                    e.end_time,
                    standardBreakMinutes(e.start_time, e.end_time, breakWindows)
                  )
                : null;
            const nightMins =
              e && e.end_time
                ? nightMinutes(e.start_time, e.end_time, breakWindows)
                : null;
            // 予定が無いのに実績がある(予定外勤務)は出勤・退勤とも相違扱いで赤太字にする
            const unplanned = !!e && !shift;
            // 予実の時刻相違(実績があるときのみ判定)。相違=赤太字・合致=黒太字
            const startDiff =
              !!e &&
              (unplanned ||
                (!!shift && !!shift.startInput && e.start_time !== shift.startInput));
            const endDiff =
              !!e &&
              (unplanned || (!!shift && (e.end_time ?? "") !== (shift.endInput ?? "")));
            const startMatch =
              !!e && !!shift && !!shift.startInput && e.start_time === shift.startInput;
            const endMatch =
              !!e &&
              !!shift &&
              !!shift.endInput &&
              !!e.end_time &&
              e.end_time === shift.endInput;

            return (
              <li
                key={date}
                onClick={() => onSelect(date)}
                className="cursor-pointer border-b-2 border-gray-200 px-3 py-2 hover:bg-blue-50/40"
              >
                <div className="flex items-start gap-3">
                  {/* 日・曜 */}
                  <div
                    className={`w-10 shrink-0 text-center leading-tight ${dowColor}`}
                  >
                    <div className="text-lg font-bold tabular-nums">
                      {d.getUTCDate()}
                    </div>
                    <div className="text-xs">{WEEKDAYS[dow]}</div>
                  </div>
                  {/* 予定行 / 実績行。見出し・枠バッジは表示せず、時刻の開始位置を両行で揃える。 */}
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* 予定(上段) */}
                    <div className="rounded bg-blue-50 px-2 py-1 text-sm">
                      {shift ? (
                        <span className="tabular-nums text-gray-800">
                          {shift.start}〜{shift.end}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">シフトなし</span>
                      )}
                    </div>
                    {/* 実績(下段) */}
                    <div className="rounded bg-green-50 px-2 py-1 text-sm">
                      {e ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="tabular-nums">
                            <span
                              className={
                                startDiff
                                  ? "font-bold text-red-600"
                                  : startMatch
                                    ? "font-bold text-gray-900"
                                    : "text-gray-800"
                              }
                            >
                              {e.start_time}
                            </span>
                            〜
                            {e.end_time ? (
                              <span
                                className={
                                  endDiff
                                    ? "font-bold text-red-600"
                                    : endMatch
                                      ? "font-bold text-gray-900"
                                      : "text-gray-800"
                                }
                              >
                                {e.end_time}
                              </span>
                            ) : (
                              <span className="rounded bg-amber-200 px-1 text-amber-800">
                                退勤未
                              </span>
                            )}
                          </span>
                          {mins !== null && (
                            <span className="tabular-nums text-gray-500">
                              {hhmm(mins)}
                              {nightMins ? `（深夜${hhmm(nightMins)}）` : ""}
                            </span>
                          )}
                          {e.transport_cost > 0 && (
                            <span className="tabular-nums text-gray-500">
                              ¥{e.transport_cost.toLocaleString()}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-red-600">
                          実績なし
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDateJa(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS[d.getUTCDay()]})`;
}

/** 分を「h:mm」表記にする(勤務一覧の勤務時間用) */
function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function EntryForm({
  date,
  entry,
  defaults,
  shift,
  pending,
  stations,
  onSave,
  onDelete,
  timeLocked = false,
}: {
  date: string;
  entry: WorkEntry | undefined;
  defaults: WorkEntry | null;
  shift: ShiftInfo | undefined;
  pending: boolean;
  stations: string[];
  onSave: (fd: FormData) => void;
  onDelete: (date: string) => void;
  /** 管理者が設定でロックした場合、出勤/退勤時刻・休憩時間を編集できない */
  timeLocked?: boolean;
}) {
  const init = entry ?? defaults;

  // 打刻で出勤のみ登録され退勤が未入力の場合、退勤欄を警告表示にする
  const endMissing = !!entry && !entry.end_time;
  // 新規入力時はシフト予定の時刻をデフォルト表示する(既存レコードがあればそれを優先)。
  const startDefault =
    entry?.start_time ?? shift?.startInput ?? init?.start_time ?? "10:00";
  const endDefault = entry?.end_time
    ? entry.end_time
    : endMissing
      ? ""
      : shift?.endInput ?? init?.end_time ?? "18:00";

  const formRef = useRef<HTMLFormElement>(null);
  const modeRef = useRef<HTMLSelectElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // ロック中に既存レコードが無い日は、時刻を確定できず新規作成できない
  // (サーバー側 upsertWorkEntry も同条件で拒否する)。フォーム自体を出さず案内のみ表示する。
  if (timeLocked && !entry) {
    return (
      <div className="rounded-xl border border-blue-200 bg-white p-4">
        <h3 className="text-lg font-bold text-blue-800">{formatDateJa(date)}</h3>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          出退勤時刻・休憩時間の編集は管理者によりロックされています。QR打刻をご利用いただくか、
          管理者にご連絡ください。
        </p>
      </div>
    );
  }

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

        {shift && (
          <p className="-mt-1 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">
            シフト予定: <span className="font-bold">{shift.label}</span>{" "}
            {shift.start}〜{shift.end}
            {!entry && "（この時刻を初期表示しています）"}
          </p>
        )}

        {/* 勤務時間。出勤・退勤を1行(2カラム)に。休憩は標準休憩ルールから自動計算するため
            入力欄は設けない。iOS Safari の time 入力は内容幅に広がりやすいため、各セルに
            min-w-0、入力は横パディングを詰めてはみ出し・重なりを防ぐ。 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-600">
              出勤
            </label>
            <input
              name="start_time"
              type="time"
              step={900}
              required
              disabled={timeLocked}
              defaultValue={startDefault}
              className={`${timeInputClass} ${timeLocked ? "opacity-60" : ""}`}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-600">
              退勤
              {endMissing && (
                <span className="ml-1 text-amber-600">未入力</span>
              )}
            </label>
            <input
              name="end_time"
              type="time"
              step={900}
              disabled={timeLocked}
              defaultValue={endDefault}
              className={`${timeInputClass} ${
                endMissing
                  ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                  : ""
              } ${timeLocked ? "opacity-60" : ""}`}
            />
          </div>
        </div>
        <p className="-mt-1 rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-500">
          ※ 休憩は原則 12:00-13:00 / 19:00-20:00 / 4:00-5:00 で、勤務時間に重なるぶんを
          自動で差し引きます(申告不要)。
        </p>
        {/* disabled にした時刻入力欄は FormData に含まれないため、実際の値を hidden で補う
            (サーバー側でもロック中は既存値に固定して二重に防御している)。休憩は保存時に
            サーバーが標準ルールから再計算するため hidden 不要。 */}
        {timeLocked && entry && (
          <>
            <input type="hidden" name="start_time" value={entry.start_time} />
            <input type="hidden" name="end_time" value={entry.end_time ?? ""} />
          </>
        )}
        {timeLocked ? (
          <p className="-mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
            出退勤時刻・休憩時間の編集は管理者によりロックされています。修正が必要な場合は管理者にご連絡ください。
          </p>
        ) : (
          <p className="-mt-2 text-xs text-gray-500">
            ※ 深夜勤務で退勤が翌日になる場合は、退勤にその時刻(例: 2:00)をそのまま入力してください。翌日ぶんとして計算します。
          </p>
        )}

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
                  区間(From)
                </label>
                <input
                  ref={fromRef}
                  name="station_from"
                  list="station-list"
                  defaultValue={init?.station_from ?? ""}
                  placeholder="例: 梅田"
                  onInput={() => fromRef.current?.setCustomValidity("")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  区間(To)
                </label>
                <input
                  ref={toRef}
                  name="station_to"
                  list="station-list"
                  defaultValue={init?.station_to ?? ""}
                  placeholder="例: 動物園前"
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

        {entry && !timeLocked && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`${formatDateJa(date)}の勤務記録を削除します。よろしいですか？`)) {
                  onDelete(date);
                }
              }}
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
