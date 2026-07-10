// app/layout.tsx への配線サンプル(最小)。要点は <ReloadPrompt /> を body に常設するだけ。
// この構成はキャッシュしない最小 SW 前提なので、Vite 版のような起動スプラッシュ/ウォッチドッグ
// (更新直後の空白画面リカバリ)は不要。SW がアセットを差し替えないため空白化が起きない。
import type { Metadata, Viewport } from "next";
import { ReloadPrompt } from "./pwa/ReloadPrompt";

export const metadata: Metadata = {
  // app/manifest.ts があれば <link rel="manifest"> は自動挿入される。
};

// iOS standalone でヘッダーがステータスバーに隠れないように viewport-fit=cover を付ける。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        {/* 新版検知バナー。色/文言/位置は props で調整可能。 */}
        <ReloadPrompt accentColor="#152449" position="top" />
      </body>
    </html>
  );
}

// ロゴ1タップ更新は、ロゴを button で包んで reloadApp() を呼ぶ(別 client component):
//
//   "use client";
//   import { reloadApp } from "@/app/pwa/reloadApp";
//   export function LogoButton() {
//     return (
//       <button type="button" onClick={() => reloadApp()} aria-label="最新の状態に更新"
//               className="touch-manipulation active:opacity-70">
//         <Logo />
//       </button>
//     );
//   }
