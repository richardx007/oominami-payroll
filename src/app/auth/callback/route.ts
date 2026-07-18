import { NextResponse } from "next/server";

/**
 * Supabaseのメールテンプレートから届くリンクの着地点。
 *
 * 以前はここで直接 verifyOtp/exchangeCodeForSession を実行していたが、
 * メールセキュリティスキャナー等によるリンクの自動先読み(プリフェッチ)で
 * 1回しか使えないトークンが消費されてしまい、本人が実際にクリックした際には
 * 既に無効("One-time token not found")というトラブルが発生した
 * (Supabase監査ログで実際に確認済み)。
 *
 * 対策として、ここでは検証を実行せず /auth/confirm へパラメータを引き継いで
 * リダイレクトするだけにする。実際のトークン消費は /auth/confirm でのボタン
 * 押下(人の操作)後に行うため、自動プリフェッチでは消費されなくなる。
 */
export async function GET(request: Request) {
  const { search, origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/auth/confirm${search}`);
}
