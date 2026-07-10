import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 静的ファイル・画像・PWA関連(Service Worker / マニフェスト)以外のすべてのパスに適用。
     * sw.js と manifest.webmanifest を除外しないと未ログイン時に /login へリダイレクトされ、
     * SW 登録やインストールが機能しなくなる。
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|swe-worker-.*\\.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
