import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaBoot } from "./pwa/PwaBoot";
import { ReloadPrompt } from "./pwa/ReloadPrompt";

export const metadata: Metadata = {
  title: "給与管理システム",
  description: "従業員勤務表・給与計算システム",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iOS standalone でヘッダーがステータスバーに隠れないように
  viewportFit: "cover",
};

// 起動ウォッチドッグ: window.load 後 6 秒たっても __APP_MOUNTED__ が未設定なら 1 回だけ reload。
// メイン JS が読めなくても動く必要があるため <head> にインライン展開する。
const BOOT_WATCHDOG = `
(function () {
  var KEY = '__boot_recover__';
  try {
    var last = Number(sessionStorage.getItem(KEY) || 0);
    if (last && Date.now() - last > 30000) sessionStorage.removeItem(KEY);
  } catch (e) {}
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (window.__APP_MOUNTED__) return;
      try {
        if (sessionStorage.getItem(KEY)) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch (e) {}
      window.location.reload();
    }, 6000);
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        {/* 起動ウォッチドッグ(モジュール読込より前に評価させるため生 script) */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/* 起動スプラッシュ: JS 読込〜React マウントまで表示。markAppMounted() で除去。 */}
        <div
          id="boot-splash"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "#152449",
            zIndex: 2147483001,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt=""
            width={72}
            height={72}
            style={{ borderRadius: 16, background: "#fff", padding: 8 }}
          />
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.25)",
              borderTopColor: "#fff",
              animation: "boot-spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes boot-spin { to { transform: rotate(360deg) } }`}</style>
        </div>

        <PwaBoot />
        {children}
        <ReloadPrompt accentColor="#152449" position="top" />
      </body>
    </html>
  );
}
