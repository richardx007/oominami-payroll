/**
 * 新しい従業員が初回パスワード設定を完了した時、管理者へ通知する送信口。
 * 未打刻通知(src/app/api/notify/punch)と同じ設計: Supabase側(DB関数)が
 * 従業員名と管理者の購読情報をまとめてこの API に POST し、ここでは
 * Web Push の暗号化と送信だけを行う(service_role キーを持たない方針のため)。
 *
 * 認証は共有シークレット(NOTIFY_SECRET、punch通知と共用)のヘッダー一致のみ。
 */

import { sendPush, type PushSubscriptionInfo } from "@/lib/web-push";

// 🔴 edge runtime を指定しない(@opennextjs/cloudflare デプロイのため。punch通知と同じ理由)。

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

  let payload: { employee_name?: string; subscriptions?: PushSubscriptionInfo[] };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSONが不正です" }, { status: 400 });
  }

  const employeeName = payload.employee_name ?? "従業員";
  const subscriptions = payload.subscriptions ?? [];
  if (subscriptions.length === 0) {
    return Response.json({ ok: true, sent: 0 });
  }

  const message = JSON.stringify({
    title: "初回ログインが完了しました",
    body: `${employeeName}さんが初回パスワード設定を完了し、利用を開始しました。`,
    tag: "first-login",
    url: "/admin/employees",
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
    console.error("[notify/first-login] 送信中に例外:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
