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

/** app_settings 未設定時の既定(要件: A 8:00-17:00 / B 15:00-24:00 / C 24:00-9:00) */
export const DEFAULT_SLOTS: Record<SlotKey, SlotDef> = {
  A: { key: "A", label: "A", start: "8:00", end: "17:00" },
  B: { key: "B", label: "B", start: "15:00", end: "24:00" },
  C: { key: "C", label: "C", start: "24:00", end: "9:00" },
};

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
      start: get(k, "start", d.start),
      end: get(k, "end", d.end),
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

/** 従業員の(work_date, slot)割当一覧から work_date -> ShiftInfo のマップを作る */
export function buildShiftMap(
  rows: { work_date: string; slot: SlotKey }[],
  slots: Record<SlotKey, SlotDef>
): Record<string, ShiftInfo> {
  const out: Record<string, ShiftInfo> = {};
  for (const r of rows) {
    const s = slots[r.slot];
    if (!s) continue;
    out[r.work_date] = {
      slot: r.slot,
      label: s.label,
      start: s.start,
      end: s.end,
      startInput: toInputTime(s.start),
      endInput: toInputTime(s.end),
    };
  }
  return out;
}

/** 予実突き合わせの状態(get_shift_status の返り値) */
export type ShiftStatus = "match" | "missing" | "timediff" | "unplanned";

/** status が「相違(赤太字にすべき)」かどうか。match 以外はすべて相違扱い。 */
export function isMismatch(status: ShiftStatus | undefined): boolean {
  return status !== undefined && status !== "match";
}
