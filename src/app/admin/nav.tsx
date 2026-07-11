"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { reloadApp } from "@/app/pwa/reloadApp";

const links = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/hours", label: "勤務時間" },
  { href: "/admin/close", label: "締め処理" },
  { href: "/admin/report", label: "税理士資料" },
  { href: "/admin/employees", label: "従業員" },
  { href: "/admin/notices", label: "連絡" },
  { href: "/admin/settings", label: "設定" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/** アプリのロゴ(public/logo.svg を表示。差し替えは public/ のファイルを置換) */
export function Logo({ className = "" }: { className?: string }) {
  // Next の Image ではなく素の img。円形ロゴ(白背景)がネイビーのバー上でも映える。
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/logo.svg"
      alt="新世界オオミナミ"
      className={`h-10 w-10 shrink-0 rounded-full bg-white object-contain ${className}`}
    />
  );
}

/**
 * ロゴボタン。タップすると PWA を最新版に更新する(新版があれば有効化してリロード)。
 * エンドユーザーがロゴを 1 回押すだけで確実に更新できるようにするための入口。
 */
export function LogoButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => reloadApp()}
      aria-label="最新の状態に更新"
      title="最新の状態に更新"
      className="touch-manipulation rounded-full active:opacity-70"
    >
      <Logo className={className} />
    </button>
  );
}

/** サイドバー(タブレット・PC)用の縦並びナビ */
export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`touch-manipulation rounded-lg px-3 py-2.5 text-lg font-medium transition-colors active:opacity-70 ${
            isActive(pathname, l.href)
              ? "bg-white text-[#152449]"
              : "text-blue-50 hover:bg-white/10 hover:text-white"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** モバイル用の横並びナビ */
export function AdminTopNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            isActive(pathname, l.href)
              ? "touch-manipulation font-semibold text-white underline"
              : "touch-manipulation text-blue-50 hover:text-white active:opacity-70"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
