import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppReloadPrompt } from "./pwa/AppReloadPrompt";
import { DeviceHint } from "./pwa/DeviceHint";

export const metadata: Metadata = {
  title: "給与管理システム",
  description: "従業員勤務表・給与計算システム",
  // src/app/manifest.webmanifest/route.ts(/install では引き継ぎ札付きに差し替える)
  manifest: "/manifest.webmanifest",
  // iOS のホーム画面アプリ: ステータスバーを透明(文字は白)にし、その裏にヘッダーの紺を敷く。
  // 既定("default")だと iOS 26 でステータスバーの部分に白いモヤ(すりガラス)が掛かる(2026-10-13)。
  // 紺の帯は globals.css の body::before、ヘッダーは env(safe-area-inset-top) の分だけ下げている
  appleWebApp: { statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iOS standalone でヘッダーがステータスバーに隠れないように
  viewportFit: "cover",
  themeColor: "#152449",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
        {/* 端末承認制: iPad(Mac を名乗るタッチ画面)の目印を付ける */}
        <DeviceHint />
        <AppReloadPrompt accentColor="#152449" position="top" />
      </body>
    </html>
  );
}
