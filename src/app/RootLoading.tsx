"use client";

import { usePathname } from "next/navigation";
import { Splash } from "./Splash";

/**
 * ルートの読み込み中表示。基本は起動時のロゴ(Splash)だが、打刻画面(/clock)へ進むときだけは
 * 打刻画面と同じ灰色の地にスピナーだけを出す。アプリ内のQR読み取りから打刻画面へ移るとき、
 * カメラ → ロゴ → 打刻画面 とチラつかないようにするため(2026-10-13 オーナー依頼)。
 * QR読み取り画面も、読み取れた時点で同じ見た目に切り替えている((employee)/QrScanButton.tsx)。
 */
export function RootLoadingView() {
  const pathname = usePathname();
  if (pathname.startsWith("/clock")) return <ClockOpening />;
  return <Splash />;
}

export function ClockOpening() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#152449]"
        role="status"
        aria-label="打刻画面を開いています"
      />
    </div>
  );
}
