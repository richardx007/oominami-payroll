"use client";

/**
 * 勤務ルール画面の上部に固定する「閉じる」バー。
 * スマホ(特にホーム画面に追加したアプリ)ではブラウザの戻るボタンが無く、元の画面に戻れなかったため追加(2026-09-24)。
 * アプリ内から開いた場合は前の画面に戻り、直接開いた場合などはホーム(/ → 管理者はシフト・従業員は勤務表)へ移る。
 * PCサイドバーのモーダル(iframe)ではモーダル自体に×があるので、ページ側は ?embed=1 で出さない。
 */
export function CloseBar() {
  function close() {
    const fromApp =
      window.history.length > 1 &&
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin;
    if (fromApp) window.history.back();
    else window.location.href = "/";
  }

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d4b25a]/60 bg-[#152449] px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white">
      <p className="text-base font-bold">勤務ルール</p>
      <button
        type="button"
        onClick={close}
        className="flex touch-manipulation items-center gap-1 rounded-lg border border-white/40 px-3 py-1.5 text-sm font-bold active:opacity-70"
      >
        <span aria-hidden="true" className="text-lg leading-none">×</span>
        閉じる
      </button>
    </div>
  );
}
