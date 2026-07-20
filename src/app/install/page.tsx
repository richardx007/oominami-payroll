import { AddToHomeScreenBanner } from "@/app/pwa/AddToHomeScreenBanner";

export const metadata = {
  title: "ホーム画面に追加 | 給与管理システム",
};

/**
 * スマホのホーム画面にアプリを追加してもらうための案内ページ。
 * QRコードから直接開けるよう未ログインでもアクセス可能(公開ページ、middlewareで許可)。
 * 実際の手順案内は AddToHomeScreenBanner が端末を判定して下部に表示する。
 */
export default function InstallPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-6 pb-32 pt-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="新世界オオミナミ"
        className="h-20 w-20 rounded-full bg-white object-contain shadow"
      />
      <h1 className="mt-6 text-xl font-bold text-gray-900">
        ホーム画面に追加してください
      </h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-600">
        アイコンをホーム画面に置いておくと、次回からアプリのようにワンタップで開けます。
        画面下に表示される案内にそって進めてください。
      </p>
      <AddToHomeScreenBanner />
    </main>
  );
}
