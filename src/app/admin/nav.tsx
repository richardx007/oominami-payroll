"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { reloadApp } from "@/app/pwa/reloadApp";

// スマホの下部タブに常時出す主要メニュー
const primaryLinks = [
  { href: "/admin", label: "シフト", icon: HomeIcon },
  { href: "/admin/timesheet", label: "勤務表", icon: CalendarIcon },
  { href: "/admin/close", label: "給与明細", icon: YenIcon },
  { href: "/admin/employees", label: "従業員", icon: PeopleIcon },
];
// スマホでは下部の余白がないため、ハンバーガー(その他)に収める。
// 「配信」は PC サイドバーでは従業員の直後に並ぶ(primaryLinks の後 = moreLinks 先頭)。
const moreLinks = [
  { href: "/admin/notices", label: "配信", icon: SendIcon },
  { href: "/admin/settings", label: "設定", icon: GearIcon },
  { href: "/admin/logs", label: "ログ", icon: LogIcon },
];
const links = [...primaryLinks, ...moreLinks];

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
      {links.map((l) => {
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-lg font-medium transition-colors active:opacity-70 ${
              isActive(pathname, l.href)
                ? "bg-white text-[#152449]"
                : "text-blue-50 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-6 w-6 shrink-0" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** モバイル用の下部タブナビ(従業員画面と同じく画面下に固定)。
 *  主要4項目＋ハンバーガー(設定・ログ)を表示する。 */
export function AdminBottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreActive = moreLinks.some((l) => isActive(pathname, l.href));

  return (
    <>
      {/* ハンバーガーで開くシート(設定・ログ) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden print:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] right-2 min-w-[8rem] overflow-hidden rounded-xl border border-white/15 bg-[#152449] text-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {moreLinks.map((l) => {
              const Icon = l.icon;
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex touch-manipulation items-center gap-2 px-4 py-3 text-base font-medium active:opacity-70 ${
                    active ? "bg-white/10 text-white" : "text-blue-50"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-[#152449] pb-[env(safe-area-inset-bottom)] text-white md:hidden print:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {primaryLinks.map((l) => {
            const Icon = l.icon;
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`flex touch-manipulation flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition active:opacity-70 ${
                  active ? "text-white" : "text-blue-100 hover:text-white"
                }`}
              >
                <Icon className="h-6 w-6" />
                {l.label}
              </Link>
            );
          })}
          {/* その他(設定・ログ)をまとめるハンバーガー */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="その他のメニュー"
            className={`flex touch-manipulation flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition active:opacity-70 ${
              menuOpen || moreActive ? "text-white" : "text-blue-100 hover:text-white"
            }`}
          >
            <MenuIcon className="h-6 w-6" />
            その他
          </button>
        </div>
      </nav>
    </>
  );
}

// 単色フラットアイコン(currentColorで色は親から継承)
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

function YenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l6 8 6-8" />
      <path d="M12 12v8M8 14h8M8 17.5h8" />
    </svg>
  );
}

function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M17.5 14.4c2.6.5 4 2.2 4 5.6" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 3L10 14" />
      <path d="M21 3l-7 18-4-8-8-4 19-6z" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5" />
    </svg>
  );
}

function LogIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3h10l4 4v14H5z" />
      <path d="M14 3v4h4M8 12h8M8 16h8M8 8h3" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
