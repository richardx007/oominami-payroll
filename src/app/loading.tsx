// アプリ起動直後(ログイン判定・初回データ取得中)に表示するスプラッシュ画面。
// ここが無いと、この間は真っ白のまま数秒待たされることになる。
// PWA のスプラッシュ(manifest の background_color/icon)と近い見た目にして、
// ネイティブスプラッシュからの切り替わりを自然にしている。
export default function RootLoading() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#152449]">
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
