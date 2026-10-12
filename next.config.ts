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
  // メタデータを <head> に入れてから返す(既定では generateMetadata の結果を後から <body> に足す)。
  // /install のマニフェスト(引き継ぎ札付き)は <head> に無いと、iPhone が「ホーム画面に追加」で
  // 読まないおそれがあるため。generateMetadata を使っているのは /install だけなので、他の画面には影響しない。
  htmlLimitedBots: /.*/,
  env: {
    // ビルドのたびに更新されるアプリのバージョン(タイムスタンプ)。
    NEXT_PUBLIC_BUILD_TIME: buildTimeJST(),
  },
  experimental: {
    // 源泉徴収税額表を丸ごと貼り付けると既定の1MBを超える場合があるため拡張
    serverActions: { bodySizeLimit: "5mb" },
  },
  async redirects() {
    // 2026-10-12 のメニュー整理で無くした画面(ブックマーク・古い通知リンク用)
    return [
      { source: "/admin/tax-table", destination: "/admin/settings", permanent: false },
      { source: "/admin/withholding", destination: "/admin/close", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // クリックジャッキング・MIMEスニッフィング対策等の基本的なセキュリティヘッダー。
        // 給与・個人情報を扱う画面のため全パスに適用する。
        // ただしホームページに iframe で埋め込む営業カレンダー(/calendar/embed)と、
        // 勤務ルール(/work-rules。?embed=1 で同一オリジンの iframe に埋め込める)は除く(下の設定)。
        source: "/:path((?!calendar/embed|work-rules).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // 打刻機能(/clock)以外では位置情報・カメラ・マイクを使わない
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=()",
          },
        ],
      },
      {
        // 勤務ルール。以前は PCサイドバーの「勤務ルール」がモーダル内の iframe で表示していたため、
        // 同じアプリ(同一オリジン)からの埋め込みだけ許可している(他サイトからは不可のまま)。
        // 2026-10-12 からメニューは /admin/work-rules 経由の画面遷移になったが、埋め込みの許可は残している。
        source: "/work-rules",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
      {
        // 営業カレンダーの埋め込み用ページ。ホームページ(別ドメイン)の iframe から表示できるようにする。
        // 公開情報(営業時間・公開イベント)だけを表示するページのため埋め込み元は限定しない。
        source: "/calendar/embed",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
