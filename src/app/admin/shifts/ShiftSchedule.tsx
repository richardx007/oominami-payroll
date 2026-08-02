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
  toInputTime,
  type NicknameStyle,
  shiftModeLabel,
  type ShiftMode,
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
/**
 * 従業員本人がかけた「変更不可」ロック。
 * ロックされた日は管理者でもシフトを追加・変更・削除できない(確定モード後も有効)。
 * シフトの有無に関わらず持てるので、「勤務不可(シフトなし+ロック)」も表現できる。
 */
export type ShiftLock = { employee_id: string; work_date: string };

/** 表示名: ニックネーム優先、無ければ氏名 */
function displayName(m: RosterMember): string {
  return m.nickname?.trim() || m.name;
}

/**
 * 「変更不可」ロックの鍵アイコン(単色フラット)。色は currentColor で親から与える。
 * ニックネームラベルの右端に置くため、小さくても形が分かる塗りつぶしにしている。
 */
function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* つる(shackle): 開いた口の形を線で描く */}
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* 本体 */}
      <rect x="5" y="10" width="14" height="10" rx="2" />
    </svg>
  );
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
  locks = [],
  statusMap,
  holidays,
  today,
  basePath,
  editable = false,
  assign,
  clear,
  setLock,
  mode,
  canSwitchMode = false,
  setMode,
  editableEmployeeId = null,
}: {
  period: Period;
  slots: Record<SlotKey, SlotDef>;
  roster: RosterMember[];
  assignments: Assignment[];
  /** 本人がかけた「変更不可」ロック */
  locks?: ShiftLock[];
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
  /** 本人が自分の予定をロック/解除する(従業員画面のみ渡す。管理者は解除できない) */
  setLock?: (workDate: string, locked: boolean) => Promise<ActionResult>;
  /** その月のモード。"draft"(調整中)=従業員が自分の希望を入力できる / "confirmed"(確定) */
  mode: ShiftMode;
  /** モードの切り替えボタンを出すか(管理者のみ) */
  canSwitchMode?: boolean;
  setMode?: (periodKey: string, status: ShiftMode) => Promise<ActionResult>;
  /**
   * 編集を1人に限定する場合の従業員ID(調整中の従業員画面)。
   * null なら editable の範囲すべてを編集できる(管理者)。
   * ※カレンダー・日別パネルの**表示は常に全員分**。他の人と希望がぶつかっていることを
   *   当人同士で調整できるようにするため、隠すのは編集操作だけにする。
   */
  editableEmployeeId?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  // モード切替の確認ダイアログ(管理者のみ)
  const [confirmMode, setConfirmMode] = useState(false);

  const memberById = useMemo(
    () => new Map(roster.map((m) => [m.id, m] as const)),
    [roster]
  );

  // 枠ボタンを押した瞬間にカレンダーへ反映するためのローカル状態(楽観的更新)。
  // サーバーの応答と再レンダーを待つと1秒ほど反応が遅れて見えるため、先に画面を
  // 更新し、保存はその裏で行う。失敗したら router.refresh() でサーバーの内容に戻す。
  const [local, setLocal] = useState(assignments);
  const [serverRef, setServerRef] = useState(assignments);
  // 保存中の件数。サーバーからの再取得でローカルの未反映分を消さないために使う
  // (ref だとレンダー中に読めないため state で持つ)
  const [savingCount, setSavingCount] = useState(0);
  if (serverRef !== assignments) {
    setServerRef(assignments);
    // 保存中の操作があるときは、まだサーバーに反映されていない分を消さないよう据え置く
    if (savingCount === 0) setLocal(assignments);
  }

  // `${empId}|${date}` -> slot / 変則出勤・退勤予定
  const slotByKey = useMemo(() => {
    const m = new Map<string, SlotKey>();
    for (const a of local) m.set(`${a.employee_id}|${a.work_date}`, a.slot);
    return m;
  }, [local]);
  const customByKey = useMemo(() => {
    const m = new Map<string, { start: string | null; end: string | null }>();
    for (const a of local)
      m.set(`${a.employee_id}|${a.work_date}`, {
        start: a.custom_start,
        end: a.custom_end,
      });
    return m;
  }, [local]);

  // ロックも楽観的更新にする(枠ボタンと同じく、押した瞬間に反映したいため)
  const [localLocks, setLocalLocks] = useState(locks);
  const [lockRef, setLockRef] = useState(locks);
  if (lockRef !== locks) {
    setLockRef(locks);
    setLocalLocks(locks);
  }
  const lockedKeys = useMemo(
    () => new Set(localLocks.map((l) => `${l.employee_id}|${l.work_date}`)),
    [localLocks]
  );

  // 日付 -> 枠 -> {メンバー, 変則時刻}配列
  const byDate = useMemo(() => {
    const m = new Map<
      string,
      Record<
        SlotKey,
        { member: RosterMember; customStart: string | null; customEnd: string | null }[]
      >
    >();
    for (const a of local) {
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
  }, [local, memberById]);

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
  const { blank: swipeBlank, attach: swipeAttach } = useSwipeNav(
    () => router.push(periodHref(1)),
    () => router.push(periodHref(-1)),
    period.key
  );

  /**
   * 枠の割当/解除。**先にローカル状態を書き換えて即座にカレンダーへ反映**し、
   * 保存はその裏で行う(useTransition は使わない。pending がサーバーの再レンダー完了まで
   * 解除されず、押してから1秒ほど反応が無いように見えたため)。
   * 失敗した場合はメッセージを出し、router.refresh() でサーバーの内容に戻す。
   */
  async function runAssign(
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    customStart?: string,
    customEnd?: string
  ) {
    if (!editable || !assign || !clear) return;

    // 楽観的更新: その日その人の行を差し替える(slot が null なら取り除く)
    setLocal((prev) => {
      const rest = prev.filter(
        (a) => !(a.employee_id === employeeId && a.work_date === workDate)
      );
      if (!slot) return rest;
      return [
        ...rest,
        {
          employee_id: employeeId,
          work_date: workDate,
          slot,
          custom_start: customStart?.trim() ? customStart : null,
          custom_end: customEnd?.trim() ? customEnd : null,
        },
      ];
    });
    setResult(null);

    setSavingCount((n) => n + 1);
    try {
      const res = slot
        ? await assign({
            employee_id: employeeId,
            work_date: workDate,
            slot,
            custom_start: customStart,
            custom_end: customEnd,
          })
        : await clear(employeeId, workDate);
      if (!res.ok) setResult(res);
    } catch {
      setResult({ ok: false, message: "保存に失敗しました" });
    } finally {
      setSavingCount((n) => n - 1);
      // 予実状態など派生表示をサーバーの内容に合わせる(失敗時はここで巻き戻る)
      router.refresh();
    }
  }

  /** 自分の予定のロック/解除(本人のみ)。枠ボタンと同じく楽観的更新にする。 */
  async function runLock(workDate: string, locked: boolean) {
    if (!setLock || !editableEmployeeId) return;
    const key = `${editableEmployeeId}|${workDate}`;
    setLocalLocks((prev) =>
      locked
        ? [...prev, { employee_id: editableEmployeeId, work_date: workDate }]
        : prev.filter((l) => `${l.employee_id}|${l.work_date}` !== key)
    );
    setResult(null);
    try {
      const res = await setLock(workDate, locked);
      if (!res.ok) setResult(res);
    } catch {
      setResult({ ok: false, message: "保存に失敗しました" });
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
      <div className="space-y-4">
        {/* 期間ナビ */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push(periodHref(-1))}
            aria-label="前月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＜
          </button>
          <span className="text-lg font-extrabold tracking-tight text-blue-800">
            {period.label}
          </span>
          <button
            onClick={() => router.push(periodHref(1))}
            aria-label="翌月"
            className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
          >
            ＞
          </button>
          <span className="ml-auto shrink-0 text-lg font-bold text-gray-700">
            シフト
          </span>
          {/* モード表示。確定=予定を表す標準のブルー、調整中=イエロー系。
              管理者はここをタップすると確認ダイアログを経て切り替えられる。 */}
          {canSwitchMode && setMode ? (
            <button
              type="button"
              onClick={() => setConfirmMode(true)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-base font-bold transition active:opacity-70 ${
                mode === "draft"
                  ? "bg-yellow-200 text-yellow-900 hover:bg-yellow-300"
                  : "bg-blue-100 text-blue-800 hover:bg-blue-200"
              }`}
            >
              {shiftModeLabel(mode)}
            </button>
          ) : (
            <span
              className={`shrink-0 rounded-lg px-2.5 py-1 text-base font-bold ${
                mode === "draft"
                  ? "bg-yellow-200 text-yellow-900"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {shiftModeLabel(mode)}
            </span>
          )}
        </div>

        {canSwitchMode && setMode && (
          <p className="text-right text-xs text-gray-500">
            {mode === "draft"
              ? "調整中をタップして確定にできます。"
              : "確定を押して調整中に戻せます"}
          </p>
        )}

        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}

        {/* カレンダー(左右スワイプで前後の月に移動)。外枠でスライドアウトをクリップする */}
        <div className="overflow-hidden">
        <div
          ref={swipeAttach}
          className="rounded-xl border-2 border-gray-400 bg-white p-0.5 sm:p-2"
        >
          <div
            className={`mb-0.5 grid grid-cols-7 rounded-lg text-center text-sm font-semibold text-gray-600 sm:mb-1 ${
              /* 調整中はモードバッジと同じイエローにして、一目で状態が分かるようにする */
              mode === "draft" ? "bg-yellow-200" : "bg-plan-100"
            }`}
          >
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
                // スワイプ中は前月のシフトが残って見えないよう中身を白紙にする
                const slotsForDay = swipeBlank ? undefined : byDate.get(date);
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
            // 枠の割当ができるか(確定モードの従業員画面では false。行は出すが枠は押せない)
            canAssign={!!assign && !!clear}
            editableEmployeeId={editableEmployeeId}
            lockedKeys={lockedKeys}
            onAssign={runAssign}
            onLock={setLock ? runLock : undefined}
          />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            日付を選ぶと、その日のシフト
            {editable ? "を編集できます。" : "を確認できます。"}
          </div>
        )}
      </div>

      {/* モード切替の確認ダイアログ(管理者のみ)。誤タップで従業員の編集可否が
          変わってしまうのを防ぐため、必ず確認を挟む。 */}
      {confirmMode && setMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmMode(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-base font-bold text-gray-900">
              {mode === "draft" ? "確定しますか？" : "調整中に戻しますか？"}
            </p>
            <p className="mt-2 text-center text-sm text-gray-500">
              {mode === "draft"
                ? "従業員はシフトを変更できなくなります。"
                : "従業員が自分の希望を入力できるようになります。"}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setResult(
                      await setMode(
                        period.key,
                        mode === "draft" ? "confirmed" : "draft"
                      )
                    );
                    setConfirmMode(false);
                    router.refresh();
                  })
                }
                className="rounded-xl bg-blue-600 py-3 text-center text-base font-bold text-white active:opacity-80 disabled:opacity-50"
              >
                {pending ? "切り替え中..." : "はい"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmMode(false)}
                className="rounded-xl border border-gray-300 py-2.5 text-center text-base font-medium text-gray-600 active:opacity-70 disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
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
  readOnly = false,
  locked = false,
  onLock,
  onAssign,
}: {
  member: RosterMember;
  date: string;
  slots: Record<SlotKey, SlotDef>;
  cur: SlotKey | null;
  customStart: string | null;
  customEnd: string | null;
  style: NicknameStyle;
  /** 他の人の行(調整中の従業員画面)・ロックされた日の管理者操作。表示はするが操作はできない */
  readOnly?: boolean;
  /** 本人が「変更不可」に設定している日か */
  locked?: boolean;
  /** ロックの切替(本人の行のみ渡る。管理者には渡さない=解除できない) */
  onLock?: (workDate: string, locked: boolean) => void;
  onAssign: (
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    customStart?: string,
    customEnd?: string
  ) => void;
}) {
  // <input type="time"> は "HH:MM"(2桁)を要求するため、保存値("8:00"等)を正規化して保持する。
  // 空文字は「変則なし=枠の既定時刻を使う」を意味する。
  const [cs, setCs] = useState(toInputTime(customStart) ?? "");
  const [ce, setCe] = useState(toInputTime(customEnd) ?? "");
  const csSaved = toInputTime(customStart) ?? "";
  const ceSaved = toInputTime(customEnd) ?? "";

  /**
   * 変則時間を空に戻す(=枠の既定時刻で勤務する)。
   * iOS のネイティブ時刻ピッカーにも「クリア」はあるが、入力欄を確実に空へ戻せる手段として
   * 明示的なボタンを置く。onMouseDown で既定動作を止めているのは、クリックで入力欄が
   * blur して onBlur の保存が先に走り、二重保存になるのを避けるため。
   */
  function clearCustom() {
    setCs("");
    setCe("");
    if (cur && (csSaved !== "" || ceSaved !== "")) {
      onAssign(m.id, date, cur, "", "");
    }
  }

  return (
    <div className="border-b border-gray-50 py-1">
      <div className="flex items-center justify-between gap-2">
        {/* ニックネームラベル。鍵は名前の直後ではなく**ラベルの右端**に固定して、
            行が変わっても鍵の位置が揃うようにする(2026-08-02にオーナー依頼) */}
        <span
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-0.5 text-sm"
          style={{
            backgroundColor: m.color ?? "#eef2f7",
            color: nicknameColor(style),
          }}
        >
          <span
            className={`min-w-0 flex-1 truncate ${nicknameClass(style)}`}
            title={m.name}
          >
            {displayName(m)}
          </span>
          {/* 本人の行は押せるトグル(オフ=薄いグレー / オン=オレンジ)。
              他の人の行は、ロック中のときだけ状態表示として出す(管理者は解除できないため) */}
          {onLock ? (
            <button
              type="button"
              onClick={() => onLock(date, !locked)}
              aria-pressed={locked}
              aria-label={
                locked ? "変更不可を解除する" : "この日を変更不可にする"
              }
              title={
                locked
                  ? "変更不可を解除する"
                  : cur
                    ? "このシフト希望を変更不可にする"
                    : "この日は勤務不可(シフトを入れさせない)にする"
              }
              className={`shrink-0 transition ${
                locked
                  ? "text-orange-500 hover:text-orange-600"
                  : "text-gray-400 hover:text-gray-500"
              }`}
            >
              <LockIcon />
            </button>
          ) : (
            locked && (
              <span
                title="本人が変更不可に設定しています"
                className="shrink-0 text-orange-500"
              >
                <LockIcon />
              </span>
            )
          )}
        </span>
        <div className="flex shrink-0 gap-1">
          {SLOT_KEYS.map((k) => (
            <button
              key={k}
              disabled={readOnly}
              onClick={() =>
                onAssign(m.id, date, cur === k ? null : k, cs, ce)
              }
              className={`h-7 rounded-lg border px-2 text-xs font-bold transition ${
                readOnly
                  ? cur === k
                    ? "border-blue-300 bg-blue-300 text-white"
                    : "border-gray-200 bg-white text-gray-300"
                  : cur === k
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {slots[k].label}
            </button>
          ))}
        </div>
      </div>
      {/* 変則勤務時間(任意)。枠が割当済みのときだけ表示。変更がある場合のみ保存。
          時刻はネイティブのダイアル選択(<input type="time">)で入力する。
          「変則勤務 [出勤] 〜 [退勤] [×]」が iPhone で1行に収まるよう、
          既定時刻は外に出さず入力欄に重ねて表示し、クリアは×アイコンにしている。 */}
      {cur && (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-1 gap-y-1">
          <span className="text-xs font-semibold text-gray-500">変則勤務</span>
          <TimeWithDefault
            value={cs}
            defaultTime={slots[cur].start}
            onChange={setCs}
            onBlur={() => {
              if (cs !== csSaved) onAssign(m.id, date, cur, cs, ce);
            }}
            disabled={readOnly}
            label="変則出勤予定"
          />
          <span className="text-xs text-gray-400">〜</span>
          <TimeWithDefault
            value={ce}
            defaultTime={slots[cur].end}
            onChange={setCe}
            onBlur={() => {
              if (ce !== ceSaved) onAssign(m.id, date, cur, cs, ce);
            }}
            disabled={readOnly}
            label="変則退勤予定"
          />
          {/* iOSのピッカーの「リセット」は効かない端末があるため、確実に空へ戻せる×を必ず置く。
              レイアウトが動かないよう、未入力でも領域は確保して薄く出す。 */}
          {!readOnly && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearCustom}
              disabled={!cs && !ce}
              aria-label="変則勤務時間をクリア"
              title="変則勤務時間をクリア(既定の時刻に戻す)"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-30"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 変則勤務時間の入力欄。未入力のときは**枠の既定時刻を薄いグレーで重ねて表示**する。
 *
 * 🔴 既定時刻を `value` に入れてはいけない。入力欄が常に値を持つことになり、
 * **クリアしても既定時刻が即座に再表示されて空に戻せなくなる**
 * (iOSのピッカーの「リセット」が効かない、という形で表面化。2026-08-01)。
 * かといって既定時刻を欄の外に出すと横幅を食って行が折り返し、見た目が崩れる。
 * そこで **value は空のまま**にして、既定時刻は `pointer-events-none` の
 * オーバーレイで上に重ねる。タップは下の input に素通りするのでダイアルは従来どおり開き、
 * 値が入ればオーバーレイは消える。
 * ※ `<input type="time">` に placeholder は使えない(効かない)ため、この方式にしている。
 */
function TimeWithDefault({
  value,
  defaultTime,
  onChange,
  onBlur,
  disabled,
  label,
}: {
  value: string;
  /** 枠の既定時刻("8:00"など)。未入力時に薄く表示する */
  defaultTime: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  label: string;
}) {
  // 変則が入っている欄は、既定のままの欄と一目で区別できるようグレー地＋白文字にする
  // (入力に気付かず変則のまま放置する事故を防ぐため。2026-08-01にオーナー依頼で追加)
  const filled = !!value;
  return (
    <span
      className={`relative inline-flex w-[5.5rem] shrink-0 items-center rounded-lg border focus-within:ring-1 focus-within:ring-blue-500 ${
        filled
          ? "border-gray-500 bg-gray-500 focus-within:border-blue-300"
          : "border-gray-300 focus-within:border-blue-500"
      }`}
    >
      <input
        type="time"
        // 30分刻み。iOSのネイティブ時刻ダイアルの「分」が 00 / 30 だけになる
        // (シフトは30分単位で足りるため。勤務表の実績入力は step=900=15分刻み)
        step={1800}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // 未入力の欄を開いたときの初期値。指定しないとブラウザが現在時刻を出すため、
        // 「開いただけで中途半端な時刻(例 23:06)が入ってしまう」事故が起きていた。
        // 00:00 から始めれば、深夜勤務の 0:00 はそのまま確定でき、他の時刻もダイアルで選びやすい。
        // 誤って開いた場合は隣の ✕ で消せる(✕は blur を止めるので保存されない)。
        onFocus={() => {
          if (!value) onChange("00:00");
        }}
        onBlur={onBlur}
        disabled={disabled}
        aria-label={label}
        className={`w-full min-w-0 bg-transparent px-1 py-1 text-center text-sm focus:outline-none ${
          filled ? "font-semibold text-white" : ""
        }`}
      />
      {!value && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white text-sm text-gray-400"
        >
          {toInputTime(defaultTime) ?? defaultTime}
        </span>
      )}
    </span>
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
  canAssign,
  editableEmployeeId,
  lockedKeys,
  onAssign,
  onLock,
}: {
  date: string;
  slots: Record<SlotKey, SlotDef>;
  roster: RosterMember[];
  slotByKey: Map<string, SlotKey>;
  customByKey: Map<string, { start: string | null; end: string | null }>;
  statusMap: Record<string, ShiftStatus>;
  editable: boolean;
  /** 枠の割当ができるか。false なら行は出すが枠ボタンは押せない(確定モードの従業員画面) */
  canAssign: boolean;
  /** 編集を1人に限定する場合の従業員ID(null なら全員を編集できる) */
  editableEmployeeId?: string | null;
  /** `${employee_id}|${work_date}` のロック集合 */
  lockedKeys: Set<string>;
  onAssign: (
    employeeId: string,
    workDate: string,
    slot: SlotKey | null,
    customStart?: string,
    customEnd?: string
  ) => void;
  /** 本人のロック切替(従業員画面のみ) */
  onLock?: (workDate: string, locked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4">
      <h3 className="text-lg font-bold text-blue-800">
        {formatDateJa(date)}
        <span className="ml-2 text-sm font-medium text-gray-500">
          シフト{canAssign ? "編集" : "予定"}
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
                    className={`flex min-w-0 items-center gap-1 text-base sm:text-lg`}
                    style={{ color: nicknameColor(style) }}
                  >
                    <span className={`truncate ${nicknameClass(style)}`}>
                      {displayName(m)}
                    </span>
                    {lockedKeys.has(`${m.id}|${date}`) && (
                      <span
                        title="本人が変更不可に設定しています"
                        className="shrink-0 text-orange-500"
                      >
                        <LockIcon />
                      </span>
                    )}
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
          {/* 枠が無いのにロックだけある人＝「この日は勤務不可」。
              枠一覧には出てこないので、別行で明示しないと存在に気付けない。 */}
          {roster
            .filter(
              (m) =>
                lockedKeys.has(`${m.id}|${date}`) &&
                !slotByKey.get(`${m.id}|${date}`)
            )
            .map((m) => (
              <Fragment key={`off-${m.id}`}>
                <span className="text-sm font-bold text-amber-700 sm:text-base">
                  勤務不可
                </span>
                <span className="flex min-w-0 items-center gap-1 text-base text-gray-500 sm:text-lg">
                  <span className="truncate">{displayName(m)}</span>
                  <span className="shrink-0 text-orange-500">
                    <LockIcon />
                  </span>
                </span>
                <span />
              </Fragment>
            ))}
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {roster.length === 0 && (
            <p className="text-sm text-gray-400">対象の従業員がいません。</p>
          )}
          {roster.map((m) => {
            const c = customByKey.get(`${m.id}|${date}`);
            // 調整中の従業員画面では自分の行だけ編集できる。他の人の行も
            // 「誰がどの枠を希望しているか」が分かるよう読み取り専用で表示する。
            const canEdit = !editableEmployeeId || editableEmployeeId === m.id;
            const locked = lockedKeys.has(`${m.id}|${date}`);
            return (
              <EditRow
                // ⚠️ key に date を含めること。m.id だけだと日付を切り替えても React が
                // 同じインスタンスを再利用し、useState の初期値が再評価されないため
                // **前の日に入力した変則時間が残ったまま**になる(2026-08-01に発覚)。
                key={`${m.id}|${date}`}
                member={m}
                date={date}
                slots={slots}
                cur={slotByKey.get(`${m.id}|${date}`) ?? null}
                customStart={c?.start ?? null}
                customEnd={c?.end ?? null}
                style={nicknameStyle(statusMap[`${m.id}|${date}`])}
                // 枠を押せない条件: 他人の行 / 割当不可(確定モード) /
                // ロックされた日(本人以外=管理者。本人は自分の意思表示なので動かせてよい)
                readOnly={!canEdit || !canAssign || (locked && !onLock)}
                locked={locked}
                // ロックを切り替えられるのは本人だけ(管理者には onLock を渡さない)
                onLock={onLock && canEdit ? onLock : undefined}
                onAssign={onAssign}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
