import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminBottomNav, AdminSidebarNav, LogoButton, PersonIcon } from "./nav";
import { signOut } from "./actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="app-shell app-shell--sidebar">
      {/* サイドバー(タブレット・PC) */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-[#152449] text-white shadow-md md:flex print:hidden">
        <div className="flex items-center gap-2 px-4 py-4">
          <LogoButton />
          <span className="text-lg font-bold">給与管理</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <AdminSidebarNav />
        </div>
        <div className="border-t border-white/15 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sm">
          {/* PC/タブレット: メニューが左側にあるので、アイコンは名前の左 */}
          <Link
            href="/admin/account"
            className="mb-2 flex items-center gap-1.5 truncate text-blue-100 hover:text-white"
          >
            <PersonIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{admin.nickname || admin.name}</span>
          </Link>
          <form action={signOut}>
            <button className="w-full rounded-lg bg-white/15 px-3 py-1.5 text-blue-50 hover:bg-white/25">
              ログアウト
            </button>
          </form>
          <div className="mt-3 text-center text-xs text-blue-200/70">
            ver.{process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev"}
          </div>
        </div>
      </aside>

      {/* モバイル用ヘッダー(下部タブナビは AdminBottomNav) */}
      <header className="z-30 shrink-0 bg-[#152449] text-white shadow-md md:hidden print:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <LogoButton />
            <span className="text-base font-bold">給与管理</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {/* モバイル: 名前の右にアイコン(iPhoneでの見え方に合わせる) */}
            <Link
              href="/admin/account"
              className="flex items-center gap-1.5 text-blue-100 hover:text-white"
            >
              <span>{admin.nickname || admin.name}</span>
              <PersonIcon className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>
      </header>

      {/* 本文だけを内部スクロールさせる(下部ナビは fixed ではなく通常フローで最下部に置く)。
          md 以上ではサイドバー横の通常スクロールに戻る(globals.css の .app-shell--sidebar) */}
      {/* 幅の制限(max-w-5xl)はここでは掛けない。日別・給与明細は表の列を多く見せたいため
          横幅いっぱいに使いたい(オーナー依頼)。他の画面は読みやすさのため各ページ側で
          `mx-auto max-w-5xl` を付けている。パディングだけはここで全画面共通にする。 */}
      <main className="app-scroll min-w-0">
        <div className="w-full min-w-0 px-4 py-6">{children}</div>
      </main>

      {/* モバイル用の下部タブナビ */}
      <AdminBottomNav />
    </div>
  );
}
