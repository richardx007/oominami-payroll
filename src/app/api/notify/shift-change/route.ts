/**
 * シフト変更通知(従業員向け)の送信口。Supabase の pg_cron から毎分、送るものがある時だけ POST される。
 * シフト通知(src/app/api/notify/shift-reminder)と同じ設計: DB 関数 collect_shift_change_notices() が
 * 対象と本人の購読情報をまとめて渡し、ここでは Web Push の暗号化と送信だけを行う
 * (service_role キーを持たない方針のため DB は読まない)。
 *
 * 認証は共有シークレット(NOTIFY_SECRET、punch通知と共用)のヘッダー一致のみ。
 */

import { sendPush, type PushSubscriptionInfo } from "@/lib/web-push";
import { buildShiftChangeMessage, type ShiftChangeNotice } from "@/lib/shift-change-notify";

// 🔴 edge runtime を指定しない(@opennextjs/cloudflare デプロイのため。punch通知と同じ理由)。

type Notice = ShiftChangeNotice & { subscriptions: PushSubscriptionInfo[] | null };

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.NOTIFY_SECRET?.trim();
  if (!secret) {
    return Response.json({ ok: false, error: "NOTIFY_SECRET が未設定です" }, { status: 503 });
  }
  if (request.headers.get("x-notify-secret")?.trim() !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();
  if (!publicKey || !privateKey) {
    return Response.json({ ok: false, error: "VAPID鍵が未設定です" }, { status: 503 });
  }

  let payload: { notices?: Notice[] };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSONが不正です" }, { status: 400 });
  }

  const notices = payload.notices ?? [];
  if (notices.length === 0) return Response.json({ ok: true, sent: 0 });

  try {
    const results = await Promise.all(
      notices.flatMap((n) => {
        const message = JSON.stringify(buildShiftChangeMessage(n));
        return (n.subscriptions ?? []).map((s) =>
          sendPush(s, message, { publicKey, privateKey, subject })
        );
      })
    );
    return Response.json({
      ok: true,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      expired: results.filter((r) => r.expired).map((r) => r.endpoint),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify/shift-change] 送信中に例外:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
