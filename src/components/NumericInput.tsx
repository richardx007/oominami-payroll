"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { sanitizeNumeric } from "@/lib/input-normalize";
import { AsciiInput } from "./AsciiInput";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** マイナスを打てるようにする */
  negative?: boolean;
  /** 小数点を打てるようにする */
  decimal?: boolean;
  /** ハイフンを残す(郵便番号など) */
  hyphen?: boolean;
};

/**
 * 数値(金額・人数・分など)の入力欄。<input type="number"> の代わりに使う。
 * PC/Mac で日本語入力のまま「１２３」と打っても半角の「123」になる。
 * 数字以外(既定。negative/decimal/hyphen で足せる)は入らない。
 *
 * type="number" をやめたのは、全角で打つと値が空になる(Safari)・確定前の文字が消える
 * などブラウザごとに挙動が揃わないため。min/max/step はブラウザでは効かないので、
 * 範囲のチェックは保存側で行う(これまでも保存側でチェックしている)。
 */
export const NumericInput = forwardRef<HTMLInputElement, Props>(function NumericInput(
  { negative, decimal, hyphen, inputMode, ...rest },
  ref
) {
  return (
    <AsciiInput
      ref={ref}
      // iPhone のテンキーにはマイナスが無いので、negative のときは通常のキーボードにする
      inputMode={inputMode ?? (negative ? "text" : decimal ? "decimal" : "numeric")}
      sanitize={(s) => sanitizeNumeric(s, { negative, decimal, hyphen })}
      {...rest}
    />
  );
});
