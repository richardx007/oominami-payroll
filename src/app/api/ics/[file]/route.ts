/**
 * シフトのカレンダー購読フィード(ICS)。URL: /api/ics/<トークン>.ics
 *
 * カレンダーアプリはログインできないため、URL中のトークンで本人を識別する
 * (middleware で /api は公開扱い)。service_role キーを持たない方針のため、
 * 未ログイン(anon)でも実行できる DB 関数 calendar_feed() が本人のシフトだけを返す。
 * トークンが無効(作り直し済み・退職者など)なら 404。
 */

import { createClient } from "@supabase/supabase-js";
import { buildShiftIcs, type CalendarFeedData } from "@/lib/ics";

// 🔴 edge runtime を指定しない(@opennextjs/cloudflare デプロイのため。notify 系と同じ理由)。

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await params;
  const token = file.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return new Response("Not Found", { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error) {
    return new Response("Service Unavailable", { status: 503 });
  }
  if (!data) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(buildShiftIcs(data as CalendarFeedData), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="shift.ics"',
      "Cache-Control": "private, no-cache",
      "X-Robots-Tag": "noindex",
    },
  });
}
