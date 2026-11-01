"use client";

import { flushSync } from "react-dom";
import type { InputHTMLAttributes } from "react";
import { normalizeTimeText, sanitizeTime } from "@/lib/input-normalize";
import { AsciiInput } from "./AsciiInput";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "onBlur"> & {
  value: string;
  onValueChange: (v: string) => void;
  /** 欄を出たとき。整えた後の値を受け取る */
  onBlur?: (v: string) => void;
  /** 受け付ける最大(分)。既定 23:59。閉店時刻のように翌日の時刻(26:00)を書く欄は広げる */
  maxMinutes?: number;
  /** 「09:00」のように時を2桁にする(保存側が HH:MM を求める欄) */
  pad?: boolean;
};

/**
 * 時刻の入力欄。テンキーの数字だけで打てる(":" は不要)。
 * 欄を出た(または Enter を押した)時点で「900」→「9:00」、「2300」→「23:00」に整える
 * (経営管理アプリ biz-management の TimeInput と同じ操作感)。
 * PC/Mac で日本語入力のまま「９００」と打っても半角になる。
 * 読めない値はそのまま残し、保存時のチェックで知らせる。
 */
export function TimeInput({ value, onValueChange, onBlur, onKeyDown, maxMinutes, pad, ...rest }: Props) {
  const normalize = (v: string) => normalizeTimeText(v, { maxMinutes, pad });
  return (
    <AsciiInput
      inputMode="numeric"
      {...rest}
      sanitize={sanitizeTime}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        // Enter でフォームが送信される前に整えておく(送信は画面の値をそのまま読むため、同期で反映する)
        if (e.key === "Enter") {
          const v = normalize(e.currentTarget.value);
          if (v !== e.currentTarget.value) flushSync(() => onValueChange(v));
        }
        onKeyDown?.(e);
      }}
      onBlur={(e) => {
        const v = normalize(e.currentTarget.value);
        if (v !== e.currentTarget.value) onValueChange(v);
        onBlur?.(v);
      }}
    />
  );
}
