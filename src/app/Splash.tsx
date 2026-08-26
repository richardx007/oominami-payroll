// 起動時・画面遷移中のローディング表示(loading.tsx 各所から共有)。
// layout側の認証待ち→page側のデータ取得待ちと、Suspense境界が続けて発火しても
// 常に同じ見た目(全画面・同じ位置・同じ大きさ)にすることで、サイズが変わって
// 見えるチラつきが起きないようにしている。
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
