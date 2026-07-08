import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebarNav, AdminTopNav, Logo } from "./nav";

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
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-blue-700 text-white shadow-md md:flex print:hidden">
        <div className="flex items-center gap-2 px-4 py-4">
          <Logo />
          <span className="text-lg font-bold">給与管理</span>
        </div>
        <div className="flex-1 px-3">
          <AdminSidebarNav />
        </div>
        <div className="border-t border-blue-600/60 px-4 py-3 text-sm">
          <div className="mb-2 truncate text-blue-100">{admin.name}</div>
          <form action={signOut}>
            <button className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-blue-50 hover:bg-blue-500">
              ログアウト
            </button>
          </form>
        </div>
      </aside>

      {/* モバイル用ヘッダー */}
      <header className="bg-blue-700 text-white shadow-md md:hidden print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <div className="flex items-center gap-2">
              <Logo />
              <span className="text-lg font-bold">給与管理</span>
            </div>
            <AdminTopNav />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-blue-100 sm:inline">{admin.name}</span>
            <form action={signOut}>
              <button className="rounded-lg bg-blue-600 px-3 py-1 text-blue-50 hover:bg-blue-500">
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
