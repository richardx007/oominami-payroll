/**
 * 承認待ちの新しい端末からログインがあった時、管理者へ通知する送信口(端末承認制)。
 * 初回ログイン通知(src/app/api/notify/first-login)と同じ設計: DB関数 device_notify_pending が
 * 本人名・端末・管理者の購読情報(本人以外)をまとめてこの API に POST し、ここでは
 * Web Push の暗号化と送信だけを行う(service_role キーを持たない方針のため)。
 *
 * 認証は共有シークレット(NOTIFY_SECRET、punch通知と共用)のヘッダー一致のみ。
 */

import { sendPush, type PushSubscriptionInfo } from "@/lib/web-push";

// 🔴 edge runtime を指定しない(@opennextjs/cloudflare デプロイのため。first-login 通知と同じ理由)。

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.NOTIFY_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { ok: false, error: "NOTIFY_SECRET が未設定です" },
      { status: 503 }
    );
  }
  if (request.headers.get("x-notify-secret")?.trim() !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();
  if (!publicKey || !privateKey) {
    return Response.json(
      { ok: false, error: "VAPID鍵が未設定です" },
      { status: 503 }
    );
  }

  let payload: {
    owner_name?: string;
    app?: string;
    label?: string;
    subscriptions?: PushSubscriptionInfo[];
  };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSONが不正です" }, { status: 400 });
  }

  const ownerName = payload.owner_name ?? "従業員";
  const appName = payload.app === "business" ? "経費管理" : "給与管理";
  const subscriptions = payload.subscriptions ?? [];
  if (subscriptions.length === 0) {
    return Response.json({ ok: true, sent: 0 });
  }

  const message = JSON.stringify({
    title: "新しい端末の承認待ち",
    body: `${ownerName}さんが新しい端末(${payload.label || "不明な端末"})から${appName}にログインしました。心当たりがあれば承認してください。`,
    tag: "new-device",
    url: "/admin/devices",
  });

  try {
    const results = await Promise.all(
      subscriptions.map((s) =>
        sendPush(s, message, { publicKey, privateKey, subject })
      )
    );

    return Response.json({
      ok: true,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      expired: results.filter((r) => r.expired).map((r) => r.endpoint),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[notify/new-device] 送信中に例外:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
