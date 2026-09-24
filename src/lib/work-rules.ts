/**
 * 勤務ルール画面（/work-rules）に出す「各番の勤務時間・休憩時間（基準）・深夜勤務時間」。
 * 「営業と勤務時間」の定義（シフト枠・休憩時間）から、給与計算と同じ式（lib/period.ts）で求める。
 * 画面の表示と給与計算が食い違わないよう、ここで独自の計算はしないこと。
 */
import type { BreakWindow } from "./breaks";
import { NIGHT_BAND, nightMinutes, shiftRange, standardBreakMinutes } from "./period";
import { normalizeSlotTime, SLOT_KEYS, type SlotDef, type SlotKey } from "./shifts";

export type TimeRange = { start: string; end: string };

export type ShiftRule = {
  key: SlotKey;
  label: string;
  /** 勤務時間（"8:00"〜"17:00"。深夜0時は "0:00"） */
  work: TimeRange;
  /** 勤務時間に重なる休憩時間帯（基準） */
  breaks: TimeRange[];
  breakMinutes: number;
  /** 勤務時間のうち深夜帯（22:00〜5:00）に入る時間帯 */
  night: TimeRange[];
  /** 深夜勤務手当の対象分数（深夜帯に取る休憩を除く） */
  nightMinutes: number;
};

/** 0時からの分（24時間を超えてもよい）→ "H:MM"（深夜0時は "0:00"） */
function minToLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return normalizeSlotTime(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
}

/** 勤務区間 [s, e) と、1日ごとに繰り返す区間 [b0, b1) の重なり（前日・当日・翌日ぶん） */
function clip(s: number, e: number, b0: number, b1: number): TimeRange[] {
  const out: TimeRange[] = [];
  for (let k = -1; k <= 1; k++) {
    const lo = Math.max(s, b0 + k * 1440);
    const hi = Math.min(e, b1 + k * 1440);
    if (hi > lo) out.push({ start: minToLabel(lo), end: minToLabel(hi) });
  }
  return out;
}

/** "2時間" / "1時間30分" / "30分" */
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function buildShiftRules(slots: Record<SlotKey, SlotDef>, windows: BreakWindow[]): ShiftRule[] {
  return SLOT_KEYS.map((k) => {
    const slot = slots[k];
    const [s, e] = shiftRange(slot.start, slot.end);
    // 休憩帯は開始時刻順に並べる（深夜番の 4:00〜5:00 のように前日・翌日側で重なるものも含む）
    const breaks = windows
      .flatMap(([w0, w1]) =>
        [-1, 0, 1]
          .map((d) => [Math.max(s, w0 + d * 1440), Math.min(e, w1 + d * 1440)] as const)
          .filter(([lo, hi]) => hi > lo)
      )
      .sort((a, b) => a[0] - b[0])
      .map(([lo, hi]) => ({ start: minToLabel(lo), end: minToLabel(hi) }));
    return {
      key: k,
      label: slot.label,
      work: { start: slot.start, end: slot.end },
      breaks,
      breakMinutes: standardBreakMinutes(slot.start, slot.end, windows),
      night: clip(s, e, NIGHT_BAND[0], NIGHT_BAND[1]),
      nightMinutes: nightMinutes(slot.start, slot.end, windows),
    };
  });
}
