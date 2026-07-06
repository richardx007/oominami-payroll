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
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-bold">給与管理</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                ダッシュボード
              </Link>
              <Link
                href="/admin/employees"
                className="text-gray-600 hover:text-gray-900"
              >
                雇用者
              </Link>
              <Link
                href="/admin/close"
                className="text-gray-600 hover:text-gray-900"
              >
                締め処理
              </Link>
              <Link
                href="/admin/notices"
                className="text-gray-600 hover:text-gray-900"
              >
                連絡
              </Link>
              <Link
                href="/admin/settings"
                className="text-gray-600 hover:text-gray-900"
              >
                設定
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-500 sm:inline">{admin.name}</span>
            <form action={signOut}>
              <button className="text-gray-500 hover:text-gray-900">
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
