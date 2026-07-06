import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // worker-mailer は cloudflare:sockets を使うためバンドルせず外部参照にする
  serverExternalPackages: ["worker-mailer"],
};

export default nextConfig;
