import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function TimesheetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await requireEmployee();

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <span className="font-bold">勤務表</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{employee.name}</span>
            {employee.is_admin && (
              <Link href="/admin" className="text-blue-600 hover:underline">
                管理画面
              </Link>
            )}
            <form action={signOut}>
              <button className="text-gray-500 hover:text-gray-900">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-3 py-4">{children}</main>
    </div>
  );
}
