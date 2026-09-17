/**
 * 営業カレンダーの自動作成（毎月15日に翌々月分）を管理者へ通知する送信口。
 * 未打刻通知(src/app/api/notify/punch)と同じ設計: Supabase側(DB関数 create_business_month_if_due)が
 * 対象月と管理者の購読情報をまとめてこの API に POST し、ここでは Web Push の暗号化と送信だけを行う
 * (service_role キーを持たない方針のため)。
 *
 * 認証は共有シークレット(NOTIFY_SECRET、punch通知と共用)のヘッダー一致のみ。
 */

import { sendPush, type PushSubscriptionInfo } from "@/lib/web-push";
import {
  buildBusinessCalendarMessage,
  type BusinessCalendarNotifyKind,
} from "@/lib/business-calendar-notify";

// 🔴 edge runtime を指定しない(@opennextjs/cloudflare デプロイのため。punch通知と同じ理由)。

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

  let payload: { kind?: string; ym?: string; subscriptions?: PushSubscriptionInfo[] };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSONが不正です" }, { status: 400 });
  }

  const kind = payload.kind as BusinessCalendarNotifyKind;
  if ((kind !== "created" && kind !== "failed") || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.ym ?? "")) {
    return Response.json({ ok: false, error: "kind / ym が不正です" }, { status: 400 });
  }
  const subscriptions = payload.subscriptions ?? [];
  if (subscriptions.length === 0) {
    return Response.json({ ok: true, sent: 0 });
  }

  const message = JSON.stringify(buildBusinessCalendarMessage(kind, payload.ym!));

  try {
    const results = await Promise.all(
      subscriptions.map((s) => sendPush(s, message, { publicKey, privateKey, subject }))
    );
    return Response.json({
      ok: true,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      expired: results.filter((r) => r.expired).map((r) => r.endpoint),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify/business-calendar] 送信中に例外:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
