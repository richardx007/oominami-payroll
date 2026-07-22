"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "./actions";

const mainItems = [
  { href: "/shifts", label: "シフト", icon: GridIcon },
  { href: "/timesheet", label: "勤務表", icon: CalendarIcon },
  { href: "/payslips", label: "給与明細", icon: YenIcon },
];

const SEEN_KEY = "notices_seen_at";
const SEEN_EVENT = "notices-seen-changed";

// localStorage の既読時刻を外部ストアとして購読する(SSR安全)
function subscribeSeen(cb: () => void) {
  window.addEventListener(SEEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SEEN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function getSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function markSeen(value: string) {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch {
    // localStorage 不可の環境では何もしない
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function EmployeeNav({
  latestNoticeAt,
  adminEmail,
  companyName,
  employeeName,
}: {
  latestNoticeAt: string | null;
  adminEmail: string;
  companyName: string;
  employeeName: string;
}) {
  const pathname = usePathname();
  const seenAt = useSyncExternalStore(subscribeSeen, getSeen, () => null);
  const [menuOpen, setMenuOpen] = useState(false);

  // お知らせ画面を開いたら既読にする(最新受信時刻を localStorage に保存)
  useEffect(() => {
    if (pathname.startsWith("/notices") && latestNoticeAt) {
      markSeen(latestNoticeAt);
    }
  }, [pathname, latestNoticeAt]);

  const hasUnread = !!latestNoticeAt && (!seenAt || latestNoticeAt > seenAt);

  // 「管理者へメール」の mailto:。件名・本文(会社名 管理者様 / 氏名です。)を自動で埋める。
  const mailtoHref = `mailto:${adminEmail}?subject=${encodeURIComponent(
    "給与管理システムより"
  )}&body=${encodeURIComponent(`${companyName} 管理者様\n${employeeName}です。\n`)}`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-white/15 bg-[#152449] pb-[env(safe-area-inset-bottom)] text-white">
      <div className="mx-auto grid max-w-lg grid-cols-4 lg:max-w-2xl lg:grid-cols-6">
        {mainItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                active ? "text-white" : "text-blue-100 hover:text-white"
              }`}
            >
              <Icon className="h-6 w-6" />
              {item.label}
            </Link>
          );
        })}

        {/* iPad/PC: ハンバーガーに閉じず、お知らせ・管理者へ✉️・ログアウトをそのまま列挙 */}
        <Link
          href="/notices"
          className={`hidden flex-col items-center gap-1 py-2.5 text-xs font-medium transition lg:flex ${
            pathname.startsWith("/notices")
              ? "text-white"
              : "text-blue-100 hover:text-white"
          }`}
        >
          <span className="relative">
            <BellIcon className="h-6 w-6" />
            {hasUnread && <UnreadDot />}
          </span>
          お知らせ
        </Link>
        <a
          href={mailtoHref}
          className="hidden flex-col items-center gap-1 py-2.5 text-xs font-medium text-blue-100 transition hover:text-white lg:flex"
        >
          <MailIcon className="h-6 w-6" />
          管理者へ✉️
        </a>
        <form action={signOut} className="hidden lg:block">
          <button
            type="submit"
            className="flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium text-blue-100 transition hover:text-white"
          >
            <LogoutIcon className="h-6 w-6" />
            ログアウト
          </button>
        </form>

        {/* スマホ: 4つ目はハンバーガー。タップでメニューを開く */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="メニュー"
          aria-expanded={menuOpen}
          className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition lg:hidden ${
            menuOpen ? "text-white" : "text-blue-100 hover:text-white"
          }`}
        >
          <span className="relative">
            <MenuIcon className="h-6 w-6" />
            {hasUnread && <UnreadDot />}
          </span>
          メニュー
        </button>
      </div>

      {/* スマホ用のポップアップメニュー(ハンバーガーの上に開く) */}
      {menuOpen && (
        <div className="lg:hidden">
          {/* 背景タップで閉じる */}
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-0 cursor-default bg-black/20"
          />
          <div className="absolute inset-x-0 bottom-full z-10 mx-auto max-w-lg px-3 pb-2">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-lg">
              <Link
                href="/notices"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <BellIcon className="h-5 w-5 text-gray-500" />
                  お知らせ
                </span>
                {hasUnread && (
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                )}
              </Link>
              <a
                href={mailtoHref}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm font-medium hover:bg-gray-50"
              >
                <MailIcon className="h-5 w-5 text-gray-500" />
                管理者へ✉️
              </a>
              {/* 区切り線の下にログアウト */}
              <form
                action={signOut}
                className="border-t-4 border-gray-100"
              >
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-gray-50"
                >
                  <LogoutIcon className="h-5 w-5" />
                  ログアウト
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function UnreadDot() {
  return (
    <span
      aria-label="未読あり"
      className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#152449]"
    />
  );
}

// 単色フラットアイコン(currentColorで色は親から継承)
function GridIcon({ className }: { className?: string }) {
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
      <path d="M3 9.5h18M3 14.5h18M9 9.5v11M15 9.5v11" />
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

function BellIcon({ className }: { className?: string }) {
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
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
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
