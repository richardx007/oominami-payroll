import Link from "next/link";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmployeeNav, EmployeeSidebarNav } from "./nav";
import { signOut } from "./actions";
import { LogoButton, PersonIcon } from "@/app/admin/nav";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await requireEmployee();

  // 最新のお知らせ受信時刻(未読バッジの判定に使う)＋管理者連絡メール用の設定
  const supabase = await createClient();
  const [{ data: latestNotice }, { data: contactRows }] = await Promise.all([
    supabase
      .from("notifications")
      .select("sent_at")
      .or(`recipient_id.eq.${employee.id},recipient_id.is.null`)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // 会社名・送信元メールは app_settings(管理者のみSELECT可)のため関数経由で取得
    supabase.rpc("get_contact_settings"),
  ]);
  const latestNoticeAt = latestNotice?.sent_at ?? null;

  const contact = new Map(
    ((contactRows ?? []) as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ])
  );
  const adminEmail = contact.get("gmail_user") ?? "";
  const companyName = contact.get("company_name") ?? "";

  const navProps = {
    latestNoticeAt,
    adminEmail,
    companyName,
    employeeName: employee.name,
  };

  // 管理画面(admin/layout.tsx)と同じ構成: md以上=左サイドバー / スマホ=上部ヘッダー＋下部タブ
  return (
    <div className="app-shell app-shell--sidebar">
      {/* サイドバー(タブレット・PC) */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-[#152449] text-white shadow-md md:flex print:hidden">
        <div className="flex items-center gap-2 px-4 py-4">
          <LogoButton />
          <span className="text-lg font-bold">給与管理</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <EmployeeSidebarNav {...navProps} />
        </div>
        <div className="border-t border-white/15 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sm">
          {/* PC/タブレット: メニューが左側にあるので、アイコンは名前の左 */}
          <Link
            href="/account"
            className="mb-2 flex items-center gap-1.5 truncate text-blue-100 hover:text-white"
          >
            <PersonIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{employee.nickname || employee.name}</span>
          </Link>
          {employee.is_admin && (
            <Link
              href="/admin"
              className="mb-2 block text-blue-100 underline hover:text-white"
            >
              管理画面
            </Link>
          )}
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

      {/* モバイル用ヘッダー(下部タブナビは EmployeeNav) */}
      <header className="z-30 shrink-0 bg-[#152449] text-white shadow-md md:hidden print:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <LogoButton />
            <span className="text-base font-bold">給与管理</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {/* モバイル: 名前の右にアイコン(iPhoneでの見え方に合わせる) */}
            <Link
              href="/account"
              className="flex items-center gap-1.5 text-blue-100 hover:text-white"
            >
              <span>{employee.nickname || employee.name}</span>
              <PersonIcon className="h-4 w-4 shrink-0" />
            </Link>
            {employee.is_admin && (
              <Link href="/admin" className="text-blue-100 underline hover:text-white">
                管理画面
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 本文だけを内部スクロールさせる(下部ナビは fixed ではなく通常フローで最下部に置く)。
          md 以上ではサイドバー横の通常スクロールに戻る(globals.css の .app-shell--sidebar) */}
      <main className="app-scroll min-w-0">
        <div className="mx-auto w-full max-w-lg px-3 py-4 md:py-6 lg:max-w-5xl">
          {children}
        </div>
      </main>

      {/* スマホ用の下部タブナビ */}
      <EmployeeNav {...navProps} />
    </div>
  );
}
