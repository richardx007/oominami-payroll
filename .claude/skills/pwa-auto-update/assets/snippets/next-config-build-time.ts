import type { NextConfig } from "next";

/** ビルド時刻を JST の "yyyy-mm-dd hh:MM" 形式で返す(アプリのバージョン表示用) */
function buildTimeJST(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const nextConfig: NextConfig = {
  env: {
    // ビルドのたびに更新されるアプリのバージョン(タイムスタンプ)。
    NEXT_PUBLIC_BUILD_TIME: buildTimeJST(),
  },
};

export default nextConfig;
