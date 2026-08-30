"use client";

import { useEffect, useState } from "react";

/**
 * 「毎回ログインを求められる」「打刻画面までたどり着けない」人向けの案内。
 *
 * iOS では職場のQRをカメラで読み取ると必ず Safari で開く(ホーム画面アプリでは開かない)。
 * その Safari が「プライベートブラウズ」だったり「すべてのCookieをブロック」設定だと、
 * ログインしてもセッションが保存されず、QRを読むたびにログイン画面に戻ってしまう。
 * その状況を分かりやすく説明する。
 *
 * - variant="login": QR経由(?redirect=/clock…)でログイン画面に来たときにフォーム上へ表示。
 * - variant="clock" : 打刻確認画面の下部に小さく表示。
 */
export function AccessHelp({ variant }: { variant: "login" | "clock" }) {
  // navigator.cookieEnabled は「すべてのCookieをブロック」設定のときに false になる(確実な判定)。
  // プライベートブラウズは確実に判定できないため、案内文で気づいてもらう。
  const [cookieBlocked, setCookieBlocked] = useState(false);

  useEffect(() => {
    // navigator はクライアントでしか読めないため、マウント後に一度だけ判定する。
    try {
      if (navigator.cookieEnabled === false) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- ブラウザ値の初回読み取り
        setCookieBlocked(true);
      }
    } catch {
      /* 取得できない環境は何もしない */
    }
  }, []);

  const tips = (
    <ul className="mt-1 list-disc space-y-1.5 pl-5">
      <li>
        Safari が「プライベートブラウズ」になっていないか確認してください。画面下部のタブ切替
        （<span className="font-bold">「◨」</span>のようなボタン）から通常タブに戻せます。
        プライベートブラウズ中はログイン状態が保存されません。
      </li>
      <li>
        iPhone の「設定」→「Safari」→「
        <span className="font-bold">すべてのCookieをブロック</span>
        」がオフになっているか確認してください。
      </li>
      <li>
        職場のQRコードは、LINE などのアプリ内ブラウザではなく
        <span className="font-bold">通常の Safari</span>で開いてください。
      </li>
      <li>
        一度ログインできれば、次からはQRを読むだけで打刻画面が開きます（毎回のログインは不要です）。
      </li>
    </ul>
  );

  return (
    <div className={variant === "login" ? "mb-5 space-y-3" : "mt-4 space-y-3"}>
      {cookieBlocked && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <p className="font-bold">Cookie がブロックされています</p>
          <p className="mt-1">
            このままではログイン状態を保存できず、打刻できません。iPhone の「設定」→「Safari」→
            「すべてのCookieをブロック」を<span className="font-bold">オフ</span>にしてから、
            この画面を開き直してください。
          </p>
        </div>
      )}

      {variant === "login" ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
          <p className="font-bold">打刻するにはログインが必要です</p>
          <p className="mt-1">
            ログインすると、そのまま出勤・退勤の画面に進みます。
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium text-blue-700">
              毎回ログインを求められるときは
            </summary>
            {tips}
          </details>
        </div>
      ) : (
        <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">
            毎回ログインを求められる／この画面が出ないときは
          </summary>
          {tips}
        </details>
      )}
    </div>
  );
}
