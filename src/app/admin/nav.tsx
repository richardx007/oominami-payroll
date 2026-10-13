"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { reloadApp } from "@/app/pwa/reloadApp";
import { signOut } from "./actions";

// スマホの下部タブに常時出す主要メニュー
const primaryLinks = [
  { href: "/admin", label: "シフト", icon: HomeIcon },
  { href: "/admin/timesheet", label: "勤務表", icon: CalendarIcon },
  { href: "/admin/daily", label: "日別", icon: CashIcon },
  { href: "/admin/close", label: "給与明細", icon: YenIcon },
];
// スマホでは下部の余白がないため、ハンバーガー(その他)に収める。
// 「従業員」は PC サイドバーでは給与明細の直後に並ぶ(primaryLinks の後 = moreLinks 先頭)。
// dividerBefore: この項目の前に区切り線を入れる(営業系と設定系の境目)
const moreLinks: { href: string; label: string; icon: typeof HomeIcon; dividerBefore?: boolean }[] = [
  { href: "/admin/employees", label: "従業員", icon: PeopleIcon },
  { href: "/admin/notices", label: "配信", icon: SendIcon },
  { href: "/admin/calendar", label: "営業カレンダー", icon: CalendarIcon },
  { href: "/admin/calendar/patterns", label: "営業と勤務", icon: ClockIcon },
  // 2026-10-12: 源泉徴収票は給与明細画面の表の下へ、税額表は設定画面の一番下へ移し、メニューから外した
  { href: "/admin/settings", label: "設定", icon: GearIcon, dividerBefore: true },
  { href: "/admin/logs", label: "操作ログ", icon: LogIcon },
  // 端末承認制(承認待ちの承認・取り消し)
  { href: "/admin/devices", label: "端末", icon: DeviceIcon },
];

// ホームページ(2026-10-12 から直接開かず、本日の営業・営業カレンダーの見え方と埋め込みコード、
// 「ホームページを表示」ボタンの画面を出す。ホームページの URL はその画面で設定する)
const HOMEPAGE_HREF = "/admin/calendar/preview";

// アプリの解説(操作説明の動画・資料へのリンク集。一覧・登録とも同じ画面)。関連情報／その他の最後に置く
const GUIDES_HREF = "/admin/guides";

// 勤務ルール(管理者用。作られ方の説明と「勤務ルールの表示」ボタン。表示画面は /work-rules)。関連情報／その他の先頭に置く
const WORK_RULES_HREF = "/admin/work-rules";

// 関連情報グループ(PC)／その他の区切り線の下(スマホ)の画面
const RELATED_HREFS = [WORK_RULES_HREF, HOMEPAGE_HREF, GUIDES_HREF];

// 経費管理アプリ(同じアドレスの /expense。Worker が経費管理の Worker へ中継する。2026-10-12)。
// ログインは共通なのでそのまま開ける。給与管理の Next.js の画面ではないので Link ではなく <a> で開く
const EXPENSE_HREF = "/expense";
// アプリ切り替えのボタン(経費管理へ)は、ほかのメニューと区別するため経費管理のテーマ色(濃いグリーン)の地に
// 白い枠で出す(2026-10-12 オーナー依頼)。白地に紺の反転は「選択中のメニュー」と同じ見た目になるので使わない
const APP_SWITCH_CLASS =
  "border border-white/40 bg-[#1b4332] font-bold text-white hover:bg-[#245a43] active:opacity-80";

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (!matches(pathname, href)) return false;
  // より詳しいメニューが一致するならそちらだけを選択中にする
  // (「営業と勤務」= /admin/calendar/patterns、「ホームページ」= /admin/calendar/preview を開いているとき
  //  「営業カレンダー」は選択しない)
  return [...primaryLinks.map((l) => l.href), ...moreLinks.map((l) => l.href), ...RELATED_HREFS].some(
    (h) => h.length > href.length && h.startsWith(href + "/") && matches(pathname, h)
  );
}

/** アプリのロゴ(public/logo.svg を表示。差し替えは public/ のファイルを置換) */
export function Logo({ className = "" }: { className?: string }) {
  // Next の Image ではなく素の img。円形ロゴ(白背景)がネイビーのバー上でも映える。
  return (
    // eslint-disable-next-line @next/next/no-img-element
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

/** アカウント設定リンク用の人物アイコン(単色フラット)。ヘッダーの名前の隣に置く。 */
export function PersonIcon({ className = "h-5 w-5" }: { className?: string }) {
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
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.5-4 4.5-6 7.5-6s6 2 7.5 6" />
    </svg>
  );
}

// サイドバーの各行に共通のクラス(グループ化で縦に長くなるため間隔は控えめ)
const sidebarItemClass =
  "flex w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-1.5 text-lg font-medium transition-colors active:opacity-70";

/** サイドバー(タブレット・PC)用の縦並びナビ。
 *  主要メニューの下に「管理」「関連情報」の2グループをトグルで開閉表示する。 */
export function AdminSidebarNav() {
  const pathname = usePathname();
  const manageActive = moreLinks.some((l) => isActive(pathname, l.href));
  // 現在いる画面が含まれるグループは既定で開く。ユーザーが操作したらその指定を優先する
  // (null = 未操作。レンダー中に導出するので effect での setState は不要)
  const [manageOverride, setManageOverride] = useState<boolean | null>(null);
  const manageOpen = manageOverride ?? manageActive;
  const [relatedOpen, setRelatedOpen] = useState(() => RELATED_HREFS.some((h) => isActive(pathname, h)));

  return (
    <nav className="flex flex-col gap-0.5">
        {primaryLinks.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`${sidebarItemClass} ${
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

        {/* 管理グループ(従業員・配信・営業カレンダー・営業と勤務・設定・操作ログ・端末) */}
        <GroupToggle
          label="管理"
          open={manageOpen}
          onToggle={() => setManageOverride(!manageOpen)}
        />
        {manageOpen &&
          moreLinks.map((l) => {
            const Icon = l.icon;
            return (
              <Fragment key={l.href}>
              {l.dividerBefore && <div className="my-1 ml-6 mr-3 border-t border-white/25" aria-hidden="true" />}
              <Link
                href={l.href}
                className={`${sidebarItemClass} pl-6 ${
                  isActive(pathname, l.href)
                    ? "bg-white text-[#152449]"
                    : "text-blue-50 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-6 w-6 shrink-0" />
                {/* 「営業カレンダー」がサイドバー幅でぎりぎり折り返すため、長い名前は字間を詰めて1行に収める */}
                <span className={`whitespace-nowrap ${l.label.length >= 7 ? "tracking-tighter" : ""}`}>
                  {l.label}
                </span>
              </Link>
              </Fragment>
            );
          })}

        {/* 関連情報グループ(勤務ルール・ホームページ)。営業カレンダーは「管理」グループにあるので置かない
            (2026-09-18: 同じ名前の項目が2つ並んで紛らわしいとオーナー指摘。従業員ナビには残す) */}
        <GroupToggle
          label="関連情報"
          open={relatedOpen}
          onToggle={() => setRelatedOpen((v) => !v)}
        />
        {relatedOpen && (
          <>
            <Link
              href={WORK_RULES_HREF}
              className={`${sidebarItemClass} pl-6 ${
                isActive(pathname, WORK_RULES_HREF)
                  ? "bg-white text-[#152449]"
                  : "text-blue-50 hover:bg-white/10 hover:text-white"
              }`}
            >
              <DocumentIcon className="h-6 w-6 shrink-0" />
              勤務ルール
            </Link>
            <Link
              href={HOMEPAGE_HREF}
              className={`${sidebarItemClass} pl-6 ${
                isActive(pathname, HOMEPAGE_HREF)
                  ? "bg-white text-[#152449]"
                  : "text-blue-50 hover:bg-white/10 hover:text-white"
              }`}
            >
              <GlobeIcon className="h-6 w-6 shrink-0" />
              ホームページ
            </Link>
            <Link
              href={GUIDES_HREF}
              className={`${sidebarItemClass} pl-6 ${
                isActive(pathname, GUIDES_HREF)
                  ? "bg-white text-[#152449]"
                  : "text-blue-50 hover:bg-white/10 hover:text-white"
              }`}
            >
              <PlayCircleIcon className="h-6 w-6 shrink-0" />
              アプリの解説
            </Link>
          </>
        )}

        {/* アプリ切り替えは「関連情報」の下(2026-10-12 オーナー依頼) */}
        <a href={EXPENSE_HREF} className={`${sidebarItemClass} mt-3 ${APP_SWITCH_CLASS}`}>
          <ReceiptIcon className="h-6 w-6 shrink-0" />
          経費へ
          <SwapIcon className="ml-auto h-5 w-5 shrink-0 opacity-80" />
        </a>
    </nav>
  );
}

/** サイドバーのグループ見出し(タップで開閉)。 */
function GroupToggle({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`${sidebarItemClass} mt-1 justify-between text-blue-100 hover:bg-white/10 hover:text-white`}
    >
      <span>{label}</span>
      <ChevronIcon
        className={`h-5 w-5 shrink-0 transition-transform ${
          open ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

/** モバイル用の下部タブナビ(従業員画面と同じく画面下に固定)。
 *  主要4項目＋ハンバーガー(設定・ログ)を表示する。 */
export function AdminBottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreActive =
    moreLinks.some((l) => isActive(pathname, l.href)) || RELATED_HREFS.some((h) => isActive(pathname, h));

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
                    l.dividerBefore ? "border-t border-white/25" : ""
                  } ${active ? "bg-white/10 text-white" : "text-blue-50"}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {l.label}
                </Link>
              );
            })}
            {/* 区切り線の下は関連情報(勤務ルール・ホームページ・アプリの解説) */}
            <Link
              href={WORK_RULES_HREF}
              onClick={() => setMenuOpen(false)}
              className={`flex touch-manipulation items-center gap-2 border-t border-white/25 px-4 py-3 text-base font-medium active:opacity-70 ${
                isActive(pathname, WORK_RULES_HREF) ? "bg-white/10 text-white" : "text-blue-50"
              }`}
            >
              <DocumentIcon className="h-5 w-5 shrink-0" />
              勤務ルール
            </Link>
            <Link
              href={HOMEPAGE_HREF}
              onClick={() => setMenuOpen(false)}
              className={`flex touch-manipulation items-center gap-2 px-4 py-3 text-base font-medium active:opacity-70 ${
                isActive(pathname, HOMEPAGE_HREF) ? "bg-white/10 text-white" : "text-blue-50"
              }`}
            >
              <GlobeIcon className="h-5 w-5 shrink-0" />
              ホームページ
            </Link>
            <Link
              href={GUIDES_HREF}
              onClick={() => setMenuOpen(false)}
              className="flex touch-manipulation items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
            >
              <PlayCircleIcon className="h-5 w-5 shrink-0" />
              アプリの解説
            </Link>
            {/* アプリ切り替えは「アプリの解説」の下(2026-10-12 オーナー依頼) */}
            <a
              href={EXPENSE_HREF}
              onClick={() => setMenuOpen(false)}
              className={`flex touch-manipulation items-center gap-2 px-4 py-3 text-base ${APP_SWITCH_CLASS}`}
            >
              <ReceiptIcon className="h-5 w-5 shrink-0" />
              経費へ
              <SwapIcon className="ml-auto h-5 w-5 shrink-0 opacity-80" />
            </a>
            {/* 区切り線の下にログアウト(ヘッダーから移設) */}
            <form action={signOut} className="border-t-4 border-white/15">
              <button
                type="submit"
                className="flex w-full touch-manipulation items-center gap-2 px-4 py-3 text-base font-medium text-blue-50 active:opacity-70"
              >
                <LogoutIcon className="h-5 w-5 shrink-0" />
                ログアウト
              </button>
            </form>
          </div>
        </div>
      )}

      {/* シェル(app-shell)の最下段に通常フローで置く。position:fixed は使わない
          (iOS でスクロール中に画面途中へ取り残される不具合があるため。globals.css の
          .app-shell のコメント参照) */}
      <nav className="z-40 shrink-0 border-t border-white/15 bg-[#152449] pb-[env(safe-area-inset-bottom)] text-white md:hidden print:hidden">
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

/** 日当レポート(現金手渡しの日払い)へのリンク用アイコン */
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

/** 営業と勤務時間メニュー用の時計アイコン */
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
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function DeviceIcon({ className }: { className?: string }) {
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
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
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

/** アプリ切り替え(経費管理へ)の目印。左右の矢印 */
function SwapIcon({ className }: { className?: string }) {
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
      <path d="M7 7h12l-3-3M17 17H5l3 3" />
    </svg>
  );
}

/** 経費管理(レシート)へのリンク用アイコン */
function ReceiptIcon({ className }: { className?: string }) {
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
      <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
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

/** サイドバーのグループ開閉を示す下向き矢印 */
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

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
