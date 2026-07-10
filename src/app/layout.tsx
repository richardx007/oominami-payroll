import type { Metadata, Viewport } from "next";
import "./globals.css";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
        <ReloadPrompt accentColor="#152449" position="top" />
      </body>
    </html>
  );
}
