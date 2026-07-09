// app/layout.tsx への追記サンプル。要点は次の 2 つ:
//   (A) <body> 内の「起動スプラッシュ」= 読み込み中も真っ暗にしない(markAppMounted で消える)
//   (B) <head> の「起動ウォッチドッグ」= 一定時間マウントできなければ 1 回だけ自動リロード
// logo / 色 / 背景は各アプリに合わせて差し替える。
//
// Next.js には index.html が無いので、Vite 版の index.html 相当をここに実装する。
// インライン script は必ず beforeInteractive 相当(= <head> に生 <script>)で入れること。
// メイン JS が読めなくても動く必要があるため。next/script の afterInteractive では手遅れになる。

import type { Metadata, Viewport } from "next";
import { PwaBoot } from "./pwa/PwaBoot"; // installPwaRecovery + markAppMounted を呼ぶ "use client"
import { ReloadPrompt } from "./pwa/ReloadPrompt";

export const metadata: Metadata = {
  // manifest は app/manifest.ts(snippets/manifest.ts 参照)で配信されるため自動で <link> される。
};

// iOS standalone でヘッダーがステータスバーに隠れないよう viewport-fit=cover を付ける。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// (B) 起動ウォッチドッグ: window.load 後 6 秒たっても __APP_MOUNTED__ が未設定なら 1 回だけ reload。
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
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        {/* (B) ウォッチドッグ: モジュール読込より前に評価させるため <head> 直下に生 script */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
      </head>
      <body>
        {/* (A) 起動スプラッシュ: JS 読込〜React マウントまで表示。markAppMounted() で remove。 */}
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
            background: "#152449", // アプリのブランドカラー(ネイビー)に合わせる
            zIndex: 2147483001,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
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
