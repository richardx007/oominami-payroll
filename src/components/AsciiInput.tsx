"use client";

import { forwardRef, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";

export type AsciiInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** 入力値を半角にして使えない文字を落とす関数 */
  sanitize: (s: string) => string;
};

/** React が管理する入力欄の値を外から書き換え、onChange を走らせる */
function setValueAndNotify(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 数値・時刻の入力欄の土台(直接は使わず NumericInput / TimeInput を使う)。
 * ブラウザからは日本語入力の「かな/英数」を切り替えられないので、PC/Mac で
 * かなモードのまま打たれたときは変換が始まった時点で確定させ、半角に直して受け取る。
 *
 * 変換中に値を書き換えると日本語入力と食い違い、「１２３」が「112123」のように二重に
 * 入ってしまう。そのため変換中は打った文字をそのまま見せ、確定してから半角に直して
 * 親の onChange に渡す(家計簿アプリ kakeibo の AsciiInput と同じ方式)。
 * value を渡さない使い方(defaultValue + フォーム送信)でも同じように直る。
 */
export const AsciiInput = forwardRef<HTMLInputElement, AsciiInputProps>(function AsciiInput(
  { sanitize, value, onChange, onBlur, onFocus, onKeyDown, onCompositionStart, onCompositionEnd, ...rest },
  ref
) {
  const composing = useRef(false);
  // 変換を確定させるために一瞬フォーカスを外している間は、親の onBlur/onFocus を呼ばない
  // (onBlur で保存する欄が、打ち始めただけで保存されてしまうため)
  const refocusing = useRef(false);
  // 変換中の表示(value を渡す使い方のときだけ使う)
  const [composingText, setComposingText] = useState<string | null>(null);
  const controlled = value !== undefined;

  return (
    <input
      ref={ref}
      type="text"
      autoComplete="off"
      {...rest}
      value={controlled ? (composingText ?? value) : undefined}
      onChange={(e) => {
        if (composing.current || (e.nativeEvent as InputEvent).isComposing) {
          if (controlled) setComposingText(e.target.value);
          return;
        }
        const ascii = sanitize(e.target.value);
        if (ascii !== e.target.value) e.target.value = ascii;
        onChange?.(e);
      }}
      onCompositionStart={(e) => {
        composing.current = true;
        if (controlled) setComposingText(e.currentTarget.value);
        onCompositionStart?.(e);
        // フォーカスを一度外して戻すと、ブラウザが変換中の文字をその場で確定する。
        // 候補ウインドウで Enter を押さなくても、打った数字がそのまま入る。
        // スマホ(指で操作する端末)ではキーボードが閉じてしまうのでやらない
        // (iPhone はテンキーが出るので、そもそも変換はほぼ起きない)
        if (window.matchMedia("(pointer: coarse)").matches) return;
        const el = e.currentTarget;
        setTimeout(() => {
          if (document.activeElement !== el) return;
          refocusing.current = true;
          el.blur();
          el.focus();
          refocusing.current = false;
        });
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        setComposingText(null);
        onCompositionEnd?.(e);
        const el = e.currentTarget;
        setValueAndNotify(el, sanitize(el.value));
      }}
      onKeyDown={(e) => {
        // 変換確定の Enter で保存などが走らないようにする
        if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
        onKeyDown?.(e);
      }}
      onBlur={(e) => {
        if (!refocusing.current) onBlur?.(e);
      }}
      onFocus={(e) => {
        if (!refocusing.current) onFocus?.(e);
      }}
    />
  );
});
