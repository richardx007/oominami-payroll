"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "./actions";

const mainItems = [
  { href: "/shifts", label: "シフト", icon: GridIcon },
  { href: "/timesheet", label: "勤務表", icon: CalendarIcon },
  { href: "/daily", label: "日別", icon: CashIcon },
  { href: "/payslips", label: "給与明細", icon: YenIcon },
];

// 営業カレンダー(このアプリの公開ページ。ホームページに埋め込んでいるものと同じ。別タブで開く)
// 2026-09-18に旧アプリ oominami-calendar の ?poster から切り替え(フェーズ7)
const CALENDAR_URL = "/calendar/embed";
// 会社ホームページ(別タブで開く)
const HOMEPAGE_URL = "https://www.oominami.com";

// アプリの解説(操作説明の動画・資料へのリンク集。管理者が設定画面で登録)。関連情報／その他の最後に置く
const GUIDES_HREF = "/guides";

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

type NavProps = {
  latestNoticeAt: string | null;
  adminEmail: string;
  companyName: string;
  employeeName: string;
};

/** お知らせの未読判定。お知らせ画面を開いたら既読にする(最新受信時刻を localStorage に保存) */
function useNoticeUnread(latestNoticeAt: string | null): boolean {
  const pathname = usePathname();
  const seenAt = useSyncExternalStore(subscribeSeen, getSeen, () => null);
  useEffect(() => {
    if (pathname.startsWith("/notices") && latestNoticeAt) {
      markSeen(latestNoticeAt);
    }
  }, [pathname, latestNoticeAt]);
  return !!latestNoticeAt && (!seenAt || latestNoticeAt > seenAt);
}

/** 「管理者へメール」の mailto:。件名・本文(会社名 管理者様 / 氏名です。)を自動で埋める。 */
function buildMailtoHref(adminEmail: string, companyName: string, employeeName: string) {
  return `mailto:${adminEmail}?subject=${encodeURIComponent(
    "給与管理システムより"
  )}&body=${encodeURIComponent(`${companyName} 管理者様\n${employeeName}です。\n`)}`;
}

const sidebarItemClass =
  "flex w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-1.5 text-lg font-medium transition-colors active:opacity-70";
const sidebarIdleClass = "text-blue-50 hover:bg-white/10 hover:text-white";
const sidebarActiveClass = "bg-white text-[#152449]";

/**
 * タブレット・PC(md以上)用の左サイドバーのメニュー。管理画面の AdminSidebarNav と同じ書式。
 * スマホは従来どおり下部タブ(EmployeeNav)。
 */
export function EmployeeSidebarNav({
  latestNoticeAt,
  adminEmail,
  companyName,
  employeeName,
}: NavProps) {
  const pathname = usePathname();
  const hasUnread = useNoticeUnread(latestNoticeAt);
  const [clockOpen, setClockOpen] = useState(false);
  const [relatedOpen, setRelatedOpen] = useState(() => pathname.startsWith(GUIDES_HREF));
  const mailtoHref = buildMailtoHref(adminEmail, companyName, employeeName);

  return (
    <>
      <nav className="flex flex-col gap-0.5">
        {mainItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${sidebarItemClass} ${
                pathname.startsWith(item.href) ? sidebarActiveClass : sidebarIdleClass
              }`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setClockOpen(true)}
          className={`${sidebarItemClass} ${sidebarIdleClass}`}
        >
          <ClockIcon className="h-6 w-6 shrink-0" />
          出退勤
        </button>
        <Link
          href="/notices"
          className={`${sidebarItemClass} ${
            pathname.startsWith("/notices") ? sidebarActiveClass : sidebarIdleClass
          }`}
        >
          <span className="relative shrink-0">
            <BellIcon className="h-6 w-6" />
            {hasUnread && <UnreadDot />}
          </span>
          お知らせ
        </Link>
        <a href={mailtoHref} className={`${sidebarItemClass} ${sidebarIdleClass}`}>
          <MailIcon className="h-6 w-6 shrink-0" />
          管理者へ✉️
        </a>

        {/* 関連情報グループ(勤務ルール・営業カレンダー・ホームページ)。管理画面と同じ */}
        <button
          type="button"
          onClick={() => setRelatedOpen((v) => !v)}
          aria-expanded={relatedOpen}
          className={`${sidebarItemClass} mt-1 justify-between text-blue-100 hover:bg-white/10 hover:text-white`}
        >
          <span>関連情報</span>
          <ChevronIcon
            className={`h-5 w-5 shrink-0 transition-transform ${relatedOpen ? "rotate-180" : ""}`}
          />
        </button>
        {relatedOpen && (
          <>
            <a
              href="/work-rules"
              className={`${sidebarItemClass} pl-6 ${sidebarIdleClass}`}
            >
              <DocumentIcon className="h-6 w-6 shrink-0" />
              勤務ルール
            </a>
            <a
              href={CALENDAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${sidebarItemClass} pl-6 ${sidebarIdleClass}`}
            >
              <PosterIcon className="h-6 w-6 shrink-0" />
              営業カレンダー
            </a>
            <a
              href={HOMEPAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${sidebarItemClass} pl-6 ${sidebarIdleClass}`}
            >
              <GlobeIcon className="h-6 w-6 shrink-0" />
              ホームページ
            </a>
            <Link
              href={GUIDES_HREF}
              className={`${sidebarItemClass} pl-6 ${
                pathname.startsWith(GUIDES_HREF) ? sidebarActiveClass : sidebarIdleClass
              }`}
            >
              <PlayCircleIcon className="h-6 w-6 shrink-0" />
              アプリの解説
            </Link>
          </>
        )}
      </nav>
      {clockOpen && <ClockSheet onClose={() => setClockOpen(false)} />}
    </>
  );
}

/** スマホ(md未満)用の下部タブ。4メニュー＋「その他」(ハンバーガー) */
export function EmployeeNav({
  latestNoticeAt,
  adminEmail,
  companyName,
  employeeName,
}: NavProps) {
  const pathname = usePathname();
  const hasUnread = useNoticeUnread(latestNoticeAt);
  const [menuOpen, setMenuOpen] = useState(false);
  // 「出退勤の記録」を選んだときに出す 出勤/退勤/キャンセル の確認ダイアログ
  const [clockOpen, setClockOpen] = useState(false);
  const mailtoHref = buildMailtoHref(adminEmail, companyName, employeeName);

  function openClock() {
    setMenuOpen(false);
    setClockOpen(true);
  }

  // シェル(app-shell)の最下段に通常フローで置く。position:fixed は使わない
  // (iOS でスクロール中に画面途中へ取り残される不具合があるため。
  //  詳細は globals.css の .app-shell のコメント参照)
  return (
    <nav className="z-10 shrink-0 border-t border-white/15 bg-[#152449] pb-[env(safe-area-inset-bottom)] text-white md:hidden print:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
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

        {/* 5つ目はハンバーガー(その他)。タップでメニューを開く */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="その他のメニュー"
          aria-expanded={menuOpen}
          className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
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
          className="fixed inset-0 z-30 bg-black/30"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute bottom-[calc(3.75rem+env(safe-area-inset-bottom))] right-2 min-w-[10rem] overflow-hidden rounded-xl border border-white/15 bg-[#152449] text-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 一番上に打刻の導線(QRを読まなくてもアプリから打刻できる) */}
            <button
              type="button"
              onClick={openClock}
              className="flex w-full items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <ClockIcon className="h-5 w-5 shrink-0" />
              出退勤の記録
            </button>
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
            <a
              href={HOMEPAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <GlobeIcon className="h-5 w-5 shrink-0" />
              ホームページ
            </a>
            <Link
              href={GUIDES_HREF}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <PlayCircleIcon className="h-5 w-5 shrink-0" />
              アプリの解説
            </Link>
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

      {clockOpen && <ClockSheet onClose={() => setClockOpen(false)} />}
    </nav>
  );
}

/**
 * 「出退勤の記録」を選んだときの確認シート。出勤/退勤で打刻画面へ、キャンセルで閉じる。
 * ヘッダー(z-30)と重ならないよう、ハンバーガーのシートと同じく画面下部に出す。
 * 打刻後・キャンセル時に元の画面へ戻れるよう、現在のパスを from で渡す(打刻画面側で検証してから使う)。
 */
function ClockSheet({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const clockHref = (type: "in" | "out") =>
    `/clock?type=${type}&from=${encodeURIComponent(pathname)}`;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mx-auto max-w-sm md:bottom-auto md:top-1/3 rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-base font-bold text-gray-900">
          出退勤の記録
        </p>
        <p className="mt-1 text-center text-sm text-gray-500">
          どちらを記録しますか？
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={clockHref("in")}
            onClick={onClose}
            className="rounded-xl bg-green-600 py-3.5 text-center text-lg font-bold text-white active:opacity-80"
          >
            出勤
          </Link>
          <Link
            href={clockHref("out")}
            onClick={onClose}
            className="rounded-xl bg-orange-500 py-3.5 text-center text-lg font-bold text-white active:opacity-80"
          >
            退勤
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 py-3 text-center text-base font-medium text-gray-600 active:opacity-70"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

/** 出退勤の記録メニュー用の時計アイコン */
function ClockIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
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

/** 日別実績(現金手渡しの日払い)へのリンク用アイコン */
function CashIcon({ className }: { className?: string }) {
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
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5h.01M18 14.5h.01" />
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
/** 会社ホームページへのリンク用アイコン */
function GlobeIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

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

function ChevronIcon({ className }: { className?: string }) {
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
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** アプリの解説（操作説明の動画）用のアイコン */
function PlayCircleIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l5.5-3.5z" />
    </svg>
  );
}
