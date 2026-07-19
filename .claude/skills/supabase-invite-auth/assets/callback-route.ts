import { NextResponse } from "next/server";

/**
 * Landing point for every Supabase auth email link (Magic Link, Confirm signup,
 * Reset password — all three templates point here).
 *
 * Deliberately does NOT call verifyOtp/exchangeCodeForSession here. Verifying on a bare GET
 * means anything that fetches this URL before the human clicks it — corporate mail security
 * gateways, antivirus link scanners, some webmail link-preview features — silently consumes
 * the single-use token. The real user then taps the link and gets an "invalid/expired" error
 * or lands on the login page, even though PKCE/template setup is otherwise correct.
 *
 * Fix: forward every query param to /auth/confirm untouched. That page only calls
 * verifyOtp/exchangeCodeForSession when a human presses a "Continue" button, so automated
 * prefetching (no JS execution, no click) can no longer burn the token.
 */
export async function GET(request: Request) {
  const { search, origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/auth/confirm${search}`);
}
