import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmployeeNav } from "./nav";
import { LogoButton } from "@/app/admin/nav";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await requireEmployee();

  // 最新のお知らせ受信時刻(未読バッジの判定に使う)
  const supabase = await createClient();
  const { data: latestNotice } = await supabase
    .from("notifications")
    .select("sent_at")
    .or(`recipient_id.eq.${employee.id},recipient_id.is.null`)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestNoticeAt = latestNotice?.sent_at ?? null;

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-10 bg-[#152449] text-white shadow-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <LogoButton />
            <span className="text-lg font-bold">給与管理</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-blue-100">{employee.name}</span>
            {employee.is_admin && (
              <Link href="/admin" className="text-blue-100 underline hover:text-white">
                管理画面
              </Link>
            )}
            <form action={signOut}>
              <button className="rounded-lg bg-blue-600 px-3 py-1 text-blue-50 hover:bg-blue-500">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-3 py-4 lg:max-w-5xl">
        {children}
      </main>
      <EmployeeNav latestNoticeAt={latestNoticeAt} />
    </div>
  );
}
