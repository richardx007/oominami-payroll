import { requireAdmin } from "@/lib/auth";
import { AdminBottomNav, AdminSidebarNav, LogoButton } from "./nav";
import { signOut } from "./actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen md:flex">
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
          <div className="mb-2 truncate text-blue-100">
            {admin.nickname || admin.name}
          </div>
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
      <header className="sticky top-0 z-10 bg-[#152449] text-white shadow-md md:hidden print:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <LogoButton />
            <span className="text-base font-bold">給与管理</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-blue-100">{admin.nickname || admin.name}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>

      {/* モバイル用の下部タブナビ */}
      <AdminBottomNav />
    </div>
  );
}
