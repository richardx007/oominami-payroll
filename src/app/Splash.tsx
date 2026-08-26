// 起動時・画面遷移中のローディング表示(loading.tsx 各所から共有)。
// ロゴを共通デザインにして、複数の Suspense 境界(layout側の認証待ち→page側の
// データ取得待ち)が続けて発火しても見た目が変わらず「白飛び」しないようにする。
export function Splash({ variant = "full" }: { variant?: "full" | "panel" }) {
  return (
    <div
      className={
        variant === "full"
          ? "fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#152449]"
          : "flex min-h-[65vh] flex-col items-center justify-center gap-4 rounded-2xl bg-[#152449]"
      }
    >
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
