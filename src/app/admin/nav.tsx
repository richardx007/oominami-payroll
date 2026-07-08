"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/employees", label: "従業員" },
  { href: "/admin/close", label: "締め処理" },
  { href: "/admin/notices", label: "連絡" },
  { href: "/admin/report", label: "税理士資料" },
  { href: "/admin/settings", label: "設定" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/** アプリのロゴ(暫定・後で差し替え可) */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-lg font-bold ${className}`}
      aria-hidden
    >
      ¥
    </span>
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
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive(pathname, l.href)
              ? "bg-white text-blue-800"
              : "text-blue-100 hover:bg-blue-600/60 hover:text-white"
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
              ? "font-semibold text-white underline"
              : "text-blue-100 hover:text-white"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
