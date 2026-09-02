// アプリ起動時のみに表示するロゴスプラッシュ(src/app/loading.tsx から使用)。
// メニュー遷移中のローディングは各所の軽量スピナー(admin/loading.tsx 等)を使い、
// ここは出さない(毎回出すと画面遷移が遅く感じるため)。
export function Splash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#152449]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="新世界オオミナミ"
        className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-white object-contain"
      />
      <span className="text-sm font-medium text-blue-100">給与管理システム</span>
      <div
        className="h-6 w-6 animate-spin rounded-full border-4 border-white/25 border-t-white"
        role="status"
        aria-label="読み込み中"
      />
    </div>
  );
}
