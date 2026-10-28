"use client";

import { useState } from "react";

/**
 * アカウント設定の最下部・右下のログアウト(2026-10-28 オーナー依頼で、メニュー・サイドバーから移設)。
 * 押すと「ログアウトしてよいですか?」を出し、もう一度押してからログアウトする。
 * ブラウザの confirm() は使わない(ホーム画面アプリで出し方がまちまちなため、画面の中で確かめる)。
 * action は管理者・従業員それぞれの signOut(サーバーアクション)。
 */
export function LogoutSection({ action }: { action: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex justify-end pt-2">
      {confirming ? (
        <form
          action={action}
          className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3"
        >
          <span className="text-sm text-gray-700">ログアウトしてよいですか？</span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            ログアウトする
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ログアウト
        </button>
      )}
    </div>
  );
}
