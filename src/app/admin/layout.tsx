import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
    <div className="min-h-screen">
      <header className="bg-blue-700 text-white shadow-md print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-lg font-bold">給与管理</span>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/admin" className="text-blue-100 hover:text-white">
                ダッシュボード
              </Link>
              <Link
                href="/admin/employees"
                className="text-blue-100 hover:text-white"
              >
                雇用者
              </Link>
              <Link
                href="/admin/close"
                className="text-blue-100 hover:text-white"
              >
                締め処理
              </Link>
              <Link
                href="/admin/notices"
                className="text-blue-100 hover:text-white"
              >
                連絡
              </Link>
              <Link
                href="/admin/report"
                className="text-blue-100 hover:text-white"
              >
                税理士資料
              </Link>
              <Link
                href="/admin/settings"
                className="text-blue-100 hover:text-white"
              >
                設定
              </Link>
            </nav>
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
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
