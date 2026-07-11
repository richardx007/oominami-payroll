import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebarNav, AdminTopNav, LogoButton } from "./nav";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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
          <div className="mb-2 truncate text-blue-100">{admin.name}</div>
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

      {/* モバイル用ヘッダー */}
      <header className="bg-[#152449] text-white shadow-md md:hidden print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <div className="flex items-center gap-2">
              <LogoButton />
              <span className="text-lg font-bold">給与管理</span>
            </div>
            <AdminTopNav />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-blue-100 sm:inline">{admin.name}</span>
            <form action={signOut}>
              <button className="rounded-lg bg-white/15 px-3 py-1 text-blue-50 hover:bg-white/25">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
