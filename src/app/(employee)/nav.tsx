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

// オオミナミ営業カレンダー(別サービス。参照のみ・別タブで開く)のポスター表示URL
const CALENDAR_URL = "https://oominami-calendar.shinsekai.workers.dev/?poster";

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
      <div className="mx-auto grid max-w-lg grid-cols-4 lg:max-w-3xl lg:grid-cols-8">
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
        <a
          href="/work-rules"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden flex-col items-center gap-1 py-2.5 text-xs font-medium text-blue-100 transition hover:text-white lg:flex"
        >
          <DocumentIcon className="h-6 w-6" />
          勤務ルール
        </a>
        <a
          href={CALENDAR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden flex-col items-center gap-1 py-2.5 text-xs font-medium text-blue-100 transition hover:text-white lg:flex"
        >
          <PosterIcon className="h-6 w-6" />
          営業カレンダー
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

        {/* スマホ: 4つ目はハンバーガー(その他)。タップでメニューを開く */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="その他のメニュー"
          aria-expanded={menuOpen}
          className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition lg:hidden ${
            menuOpen ? "text-white" : "text-blue-100 hover:text-white"
          }`}
        >
          <span className="relative">
            <MenuIcon className="h-6 w-6" />
            {hasUnread && <UnreadDot />}
          </span>
          その他
        </button>
      </div>

      {/* スマホ用のポップアップ(管理者ナビと同じ書式=右寄せ・フッタと同じ背景色) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute bottom-[calc(3.75rem+env(safe-area-inset-bottom))] right-2 min-w-[10rem] overflow-hidden rounded-xl border border-white/15 bg-[#152449] text-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href="/notices"
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <span className="flex items-center gap-2">
                <BellIcon className="h-5 w-5 shrink-0" />
                お知らせ
              </span>
              {hasUnread && (
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
            </Link>
            <a
              href={mailtoHref}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <MailIcon className="h-5 w-5 shrink-0" />
              管理者へ✉️
            </a>
            <a
              href="/work-rules"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <DocumentIcon className="h-5 w-5 shrink-0" />
              勤務ルール
            </a>
            <a
              href={CALENDAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <PosterIcon className="h-5 w-5 shrink-0" />
              営業カレンダー
            </a>
            {/* 区切り線の下にログアウト */}
            <form action={signOut} className="border-t-4 border-white/15">
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
              >
                <LogoutIcon className="h-5 w-5 shrink-0" />
                ログアウト
              </button>
            </form>
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

function DocumentIcon({ className }: { className?: string }) {
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
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3M9 12h6M9 16h6M9 8h2" />
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

/** 営業カレンダー(ポスター表示)へのリンク用アイコン */
function PosterIcon({ className }: { className?: string }) {
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
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="M4 16l4.5-4.5a1.5 1.5 0 0 1 2.1 0L14 15l1-1a1.5 1.5 0 0 1 2.1 0L20 17" />
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
