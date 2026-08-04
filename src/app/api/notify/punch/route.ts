/**
 * 未打刻通知の送信口。Supabase の pg_cron から5分ごとに POST される。
 *
 * 役割は Web Push の暗号化と送信だけ。**DBは一切読まない**。
 * (このアプリは service_role キーを持たない方針のため、サーバー側から RLS を越えて
 *  購読情報を読む手段が無い。代わりに、DB内で動く cron が検出結果と送信先をまとめて
 *  この API に渡す。詳細は supabase/migrations/20260804060000_push_notifications.sql)
 *
 * 認証は共有シークレット(NOTIFY_SECRET)のヘッダー一致のみ。ログイン利用者向けの
 * 画面ではないので Supabase の認証は通さない。
 */

import { sendPush, type PushSubscriptionInfo } from "@/lib/web-push";

export const runtime = "edge";

type Alert = {
  name: string;
  work_date: string;
  kind: "in" | "out";
  due_at: string;
};

/** 通知の本文を組み立てる。件数が多い場合は先頭数件＋「ほかN件」に丸める。 */
function buildMessage(alerts: Alert[]): { title: string; body: string } {
  const lines = alerts
    .slice(0, 5)
    .map(
      (a) =>
        `${a.name}さん: ${a.kind === "in" ? "出勤" : "退勤"}未打刻（予定 ${a.due_at}）`
    );
  if (alerts.length > 5) lines.push(`ほか${alerts.length - 5}件`);
  return {
    title: alerts.length === 1 ? "未打刻があります" : `未打刻が${alerts.length}件あります`,
    body: lines.join("\n"),
  };
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "NOTIFY_SECRET が未設定です" },
      { status: 503 }
    );
  }
  if (request.headers.get("x-notify-secret") !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    return Response.json(
      { ok: false, error: "VAPID鍵が未設定です" },
      { status: 503 }
    );
  }

  let payload: { alerts?: Alert[]; subscriptions?: PushSubscriptionInfo[] };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSONが不正です" }, { status: 400 });
  }

  const alerts = payload.alerts ?? [];
  const subscriptions = payload.subscriptions ?? [];
  // 送るものが無い(未打刻なし)か、送り先が無い(誰も通知を許可していない)場合は正常終了。
  // cron は5分ごとに来るので、ここが大半のケースになる。
  if (alerts.length === 0 || subscriptions.length === 0) {
    return Response.json({ ok: true, sent: 0 });
  }

  const { title, body } = buildMessage(alerts);
  const message = JSON.stringify({
    title,
    body,
    tag: "punch-alert",
    url: "/admin/timesheet",
  });

  const results = await Promise.all(
    subscriptions.map((s) =>
      sendPush(s, message, { publicKey, privateKey, subject })
    )
  );

  return Response.json({
    ok: true,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    // 404/410 は購読切れ。端末側が再購読すれば解消するので、ここでは記録のみ。
    expired: results.filter((r) => r.expired).map((r) => r.endpoint),
  });
}
