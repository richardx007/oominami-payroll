/**
 * シフト予定・勤務予実まわりの共通定義。
 * - 1日3枠(A/B/C)の交代制。枠のラベル・時刻は app_settings に保存し、設定画面から編集可能。
 * - 従業員には識別色を割り当て、シフト表でニックネーム背景に使う。
 */

export type SlotKey = "A" | "B" | "C";
export const SLOT_KEYS: SlotKey[] = ["A", "B", "C"];

export type SlotDef = {
  key: SlotKey;
  label: string;
  start: string; // 表示用の生の値("8:00" や "24:00" もそのまま)
  end: string;
};

/** app_settings 未設定時の既定(要件: 早番 8:00-17:00 / 遅番 15:00-0:00 / 深夜 0:00-9:00) */
export const DEFAULT_SLOTS: Record<SlotKey, SlotDef> = {
  A: { key: "A", label: "早番", start: "8:00", end: "17:00" },
  B: { key: "B", label: "遅番", start: "15:00", end: "0:00" },
  C: { key: "C", label: "深夜", start: "0:00", end: "9:00" },
};

/**
 * 表示用の時刻文字列を「深夜0時=0時」に統一した "H:MM" 表記へ正規化する。
 * "24:00"→"0:00"、"08:00"→"8:00"、"24:30"→"0:30"。
 * 時は 0-23 に丸め(% 24)、分は2桁、時は先頭ゼロなし。パースできない値はそのまま返す。
 */
export function normalizeSlotTime(t: string | null | undefined): string {
  if (!t) return t ?? "";
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t.trim());
  if (!m) return t.trim();
  const h = Number(m[1]) % 24;
  const min = Number(m[2]);
  return `${h}:${String(min).padStart(2, "0")}`;
}

/** app_settings の key/value 配列からシフト枠定義を組み立てる */
export function parseSlots(
  rows: { key: string; value: string }[] | null | undefined
): Record<SlotKey, SlotDef> {
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  const get = (k: SlotKey, field: "label" | "start" | "end", fallback: string) => {
    const v = map.get(`shift_slot_${k.toLowerCase()}_${field}`);
    return v && v.trim() !== "" ? v : fallback;
  };
  const out = {} as Record<SlotKey, SlotDef>;
  for (const k of SLOT_KEYS) {
    const d = DEFAULT_SLOTS[k];
    out[k] = {
      key: k,
      label: get(k, "label", d.label),
      start: normalizeSlotTime(get(k, "start", d.start)),
      end: normalizeSlotTime(get(k, "end", d.end)),
    };
  }
  return out;
}

/** app_settings のシフト枠キー一覧(page から SELECT する用) */
export const SHIFT_SETTING_KEYS = SLOT_KEYS.flatMap((k) => [
  `shift_slot_${k.toLowerCase()}_label`,
  `shift_slot_${k.toLowerCase()}_start`,
  `shift_slot_${k.toLowerCase()}_end`,
]);

/**
 * 表示用の "H:MM"/"24:00" を <input type="time"> 用の "HH:MM"(00:00-23:59) に正規化する。
 * "24:00"(深夜0時)は "00:00" に、"8:00" は "08:00" に変換。空なら null。
 */
export function toInputTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]) % 24;
  const min = Number(m[2]);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** 枠の時刻を「8:00〜17:00」形式で表示する */
export function slotRangeLabel(slot: SlotDef): string {
  return `${slot.start}〜${slot.end}`;
}

/** "8:00"/"24:00" 等から時(HH)だけを取り出す(深夜0時は0時に統一・24→0に丸める) */
function rawHour(t: string): string {
  const m = /^(\d{1,2}):/.exec(t.trim());
  return m ? String(Number(m[1]) % 24) : t.trim();
}

/** 枠の時刻を「8〜17時」形式(時のみ)で表示する。シフト編集パネルの凡例など、短く収めたい場所で使う */
export function slotHourRangeLabel(slot: SlotDef): string {
  return `${rawHour(slot.start)}〜${rawHour(slot.end)}時`;
}

/**
 * 従業員の識別色パレット(10色)。
 * 背景色にふさわしく明度が高く彩度の低い色。濃い文字(#1f2937)が乗る前提。重複割当も許容。
 */
export const SHIFT_COLORS: string[] = [
  "#FDE2E4", // ローズ
  "#FAD9C9", // アプリコット
  "#FFF1C9", // レモン
  "#E2F0CB", // ライトグリーン
  "#C7E9DE", // ミント
  "#C9E4F6", // スカイ
  "#D3E0F5", // ブルー
  "#E0D6F5", // ラベンダー
  "#F5D6EC", // ピンク
  "#E4E2DD", // グレージュ
];

/** シフト表・従業員一覧で色チップに使う濃い文字色 */
export const SHIFT_TEXT_COLOR = "#1f2937";

/** 勤務表(予実一覧・入力デフォルト)で使う、ある日のシフト予定情報 */
export type ShiftInfo = {
  slot: SlotKey;
  label: string;
  start: string; // 表示用(生の値。"24:00" などもそのまま)
  end: string;
  startInput: string | null; // <input type="time"> 用に正規化
  endInput: string | null;
};

/** 従業員の(work_date, slot, 変則時刻)割当一覧から work_date -> ShiftInfo のマップを作る。
 *  変則出勤/退勤予定(custom_start/custom_end)が入力されていれば枠の既定時刻を上書きする。 */
export function buildShiftMap(
  rows: {
    work_date: string;
    slot: SlotKey;
    custom_start?: string | null;
    custom_end?: string | null;
  }[],
  slots: Record<SlotKey, SlotDef>
): Record<string, ShiftInfo> {
  const out: Record<string, ShiftInfo> = {};
  for (const r of rows) {
    const s = slots[r.slot];
    if (!s) continue;
    const start = normalizeSlotTime(r.custom_start?.trim() || s.start);
    const end = normalizeSlotTime(r.custom_end?.trim() || s.end);
    out[r.work_date] = {
      slot: r.slot,
      label: s.label,
      start,
      end,
      startInput: toInputTime(start),
      endInput: toInputTime(end),
    };
  }
  return out;
}

/**
 * カレンダーチップに表示する変則勤務の短縮ラベルを作る。時・分のうち時(HH)のみを採用する。
 * 例: 開始のみ変則("11:00")→"11〜" / 終了のみ変則("11:00")→"〜11" / 両方→"11〜18"。
 * どちらも未入力なら空文字("" は表示しない)。
 */
export function shiftNoteLabel(
  customStart: string | null | undefined,
  customEnd: string | null | undefined
): string {
  const hourOnly = (t: string): string => {
    const m = /^(\d{1,2}):/.exec(t.trim());
    return m ? String(Number(m[1]) % 24) : t.trim();
  };
  const cs = customStart?.trim();
  const ce = customEnd?.trim();
  if (cs && ce) return `${hourOnly(cs)}〜${hourOnly(ce)}`;
  if (cs) return `${hourOnly(cs)}〜`;
  if (ce) return `〜${hourOnly(ce)}`;
  return "";
}

/**
 * シフト予定表(日別パネル)で使う、変則勤務時間の括弧書きラベルを作る。
 * カレンダーチップの短縮表記(時のみ)と異なり、こちらは分まで含めた表記をそのまま使う。
 * 例: 終了のみ変則("11:00")→"（〜11:00）" / 開始のみ変則("11:00")→"（11:00〜）"。
 * どちらも未入力なら空文字(括弧ごと非表示)。
 */
export function customTimeParen(
  customStart: string | null | undefined,
  customEnd: string | null | undefined
): string {
  const cs = customStart?.trim() ? normalizeSlotTime(customStart) : "";
  const ce = customEnd?.trim() ? normalizeSlotTime(customEnd) : "";
  if (cs && ce) return `（${cs}〜${ce}）`;
  if (cs) return `（${cs}〜）`;
  if (ce) return `（〜${ce}）`;
  return "";
}

/** 予実突き合わせの状態(get_shift_status の返り値) */
export type ShiftStatus = "match" | "missing" | "timediff" | "unplanned";

/**
 * ニックネームのフォント表示区分。
 * - "normal": 実績が未入力(missing)→通常フォント
 * - "match": 実績が予定と合致→黒字の太字
 * - "mismatch": 実績が予定と不一致(timediff/unplanned)→赤字の太字
 * - "overdue": 本日限定。退勤予定を30分以上過ぎても退勤が未打刻→赤字の細字(太字にしない)
 */
export type NicknameStyle = "normal" | "match" | "mismatch" | "overdue";

export function nicknameStyle(status: ShiftStatus | undefined): NicknameStyle {
  if (status === "match") return "match";
  if (status === "timediff" || status === "unplanned") return "mismatch";
  return "normal";
}

/** get_shift_status() が返す予定/実績の生時刻("H:MM"正規化済み/"HH:MM") */
export type ShiftTimes = {
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
};

function hhmmToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * 予定の出勤/退勤を実際のタイムスタンプへ変換する。開始が0〜5時台なら「翌日」扱いにする
 * (未打刻通知 collect_punch_alerts() と同じ判定。深夜番の開始が当日0時台になるケースに対応)。
 */
export function scheduleWindow(
  workDate: string,
  startHHMM: string,
  endHHMM: string
): { startAt: Date; endAt: Date } {
  const sMin = hhmmToMinutes(startHHMM);
  const eMin = hhmmToMinutes(endHHMM);
  const base = new Date(`${workDate}T00:00:00+09:00`);
  let startAt = new Date(base.getTime() + sMin * 60000);
  if (sMin < 5 * 60) startAt = new Date(startAt.getTime() + 24 * 3600000);
  const durMin = eMin > sMin ? eMin - sMin : eMin - sMin + 24 * 60;
  const endAt = new Date(startAt.getTime() + durMin * 60000);
  return { startAt, endAt };
}

/**
 * 本日限定のニックネーム表示区分。予定通りの出勤をしているかを一目で示すため、
 * 通常の突合ロジック(nicknameStyle)より優先して使う。
 * - 出勤予定時刻を過ぎても出勤が未打刻 → "mismatch"(赤太字)
 * - 出勤済み・退勤予定時刻+30分以内で退勤が未打刻 → "match"(黒太字)
 * - 退勤予定時刻を30分以上過ぎても退勤が未打刻 → "overdue"(赤細字)
 * - 出退勤とも打刻済み → null を返す(呼び出し側は nicknameStyle(status) にフォールバックすること)
 * - その日にシフト予定が無い → null
 */
export function todayNicknameStyle(
  times: ShiftTimes | undefined,
  workDate: string,
  nowMs: number
): NicknameStyle | null {
  if (!times?.plannedStart) return null;
  const { startAt, endAt } = scheduleWindow(
    workDate,
    times.plannedStart,
    times.plannedEnd ?? times.plannedStart
  );

  if (!times.actualStart) {
    return nowMs >= startAt.getTime() ? "mismatch" : "normal";
  }
  if (!times.actualEnd) {
    const graceMs = endAt.getTime() + 30 * 60000;
    return nowMs <= graceMs ? "match" : "overdue";
  }
  return null;
}

/**
 * シフトのモード（月ごと）。
 * - "confirmed"(確定): 管理者だけが編集でき、全員が全員のシフトを閲覧できる（従来の動作）
 * - "draft"(調整中): 各従業員が自分の希望を自分で入力する。従業員には自分の希望だけが見え、
 *   他人の希望は見えない（管理者は全員分を参照・編集できる）
 *
 * 希望と確定は同じ `shift_assignments` に持つ。モードを切り替えても
 * データは移し替えず、編集・参照の可否（RLS）だけが変わる。
 */
export type ShiftMode = "draft" | "confirmed";

/**
 * shift_modes に行が無い月の既定モード。
 * 翌月度以降（=これから調整する未来の月）は調整中、今月度以前は確定とする。
 * ※DB側の `is_shift_draft()` と同じ規則。**片方だけ変えないこと。**
 */
export function defaultShiftMode(
  periodKey: string,
  currentPeriodKey: string
): ShiftMode {
  return periodKey > currentPeriodKey ? "draft" : "confirmed";
}

export function shiftModeLabel(mode: ShiftMode): string {
  return mode === "draft" ? "調整中" : "確定";
}
