import Link from "next/link";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmployeeNav } from "./nav";
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

  return (
    <div className="app-shell">
      <header className="z-30 shrink-0 bg-[#152449] text-white shadow-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <LogoButton />
            <span className="text-lg font-bold">給与管理</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {/* 名前の右にアイコン(スマホの見え方に合わせる。iPhoneの場合は名前の右側) */}
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
      {/* 本文だけを内部スクロールさせる(下部ナビは fixed ではなく通常フローで最下部に置く) */}
      <main className="app-scroll">
        <div className="mx-auto w-full max-w-lg px-3 py-4 lg:max-w-5xl">
          {children}
        </div>
      </main>
      <EmployeeNav
        latestNoticeAt={latestNoticeAt}
        adminEmail={adminEmail}
        companyName={companyName}
        employeeName={employee.name}
      />
    </div>
  );
}
