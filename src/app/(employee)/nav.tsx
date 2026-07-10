"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/timesheet", label: "勤務表", icon: CalendarIcon },
  { href: "/payslips", label: "給与明細", icon: WalletIcon },
  { href: "/notices", label: "お知らせ", icon: BellIcon },
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
}: {
  latestNoticeAt: string | null;
}) {
  const pathname = usePathname();
  const seenAt = useSyncExternalStore(subscribeSeen, getSeen, () => null);

  // お知らせ画面を開いたら既読にする(最新受信時刻を localStorage に保存)
  useEffect(() => {
    if (pathname.startsWith("/notices") && latestNoticeAt) {
      markSeen(latestNoticeAt);
    }
  }, [pathname, latestNoticeAt]);

  const hasUnread = !!latestNoticeAt && (!seenAt || latestNoticeAt > seenAt);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/notices" && hasUnread;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                active ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="relative">
                <Icon className="h-6 w-6" />
                {showBadge && (
                  <span
                    aria-label="未読あり"
                    className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                  />
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// 単色フラットアイコン(currentColorで色は親から継承)
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

function WalletIcon({ className }: { className?: string }) {
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
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <path d="M3 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3" />
      <path d="M20 10.5h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1Z" />
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
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
