"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireEmployee } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import { sendPush } from "@/lib/web-push";
import type { ActionResult } from "../admin/employees/actions";

const profileSchema = z.object({
  nickname: z.string().max(50).optional(),
  name: z.string().min(1, "氏名を入力してください").max(100),
  furigana: z.string().max(50).optional(),
});

/**
 * 本人がニックネーム・氏名・ふりがなを変更する(管理者・従業員共通)。
 * DB側の update_own_profile() 経由で自分の行のこの3列だけを更新する
 * (employees テーブルへの直接UPDATE権限は与えていない。管理者用の
 * employees_admin_all ポリシーと同じロールで動くため、列単位GRANTでは
 * 安全に絞り込めない。詳細は該当マイグレーションのコメント参照)。
 */
export async function updateOwnProfile(formData: FormData): Promise<ActionResult> {
  await requireEmployee();

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_own_profile", {
    p_nickname: d.nickname?.trim() || null,
    p_name: d.name,
    p_furigana: d.furigana?.trim() || null,
  });

  if (error) return { ok: false, message: "更新に失敗しました" };

  await logActivity("プロフィール更新", "本人がニックネーム・氏名・ふりがなを変更");

  revalidatePath("/account");
  revalidatePath("/admin/account");
  return { ok: true, message: "更新しました" };
}

const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(200),
});

/**
 * この端末を通知先として登録する(管理者・従業員共通)。
 * ブラウザから受け取った購読情報をそのまま保存するだけ。RLSにより自分の行しか作れない。
 */
export async function saveMyPushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<ActionResult> {
  const me = await requireEmployee();

  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "購読情報の形式が正しくありません" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      employee_id: me.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      user_agent: input.userAgent?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" }
  );

  if (error) return { ok: false, message: "端末の登録に失敗しました" };

  revalidatePath("/account");
  revalidatePath("/admin/account");
  return { ok: true, message: "この端末で通知を受け取れるようになりました" };
}

/** この端末の購読を解除する(管理者・従業員共通) */
export async function deleteMyPushSubscription(endpoint: string): Promise<ActionResult> {
  await requireEmployee();
  const supabase = await createClient();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) return { ok: false, message: "解除に失敗しました" };

  revalidatePath("/account");
  revalidatePath("/admin/account");
  return { ok: true, message: "この端末への通知を解除しました" };
}

/**
 * この端末にテスト通知を送る(管理者・従業員共通)。
 * 「通知が来ない」ときに、その端末の購読が生きているかを本人がその場で確かめるための機能
 * (2026-09-18に、古い購読が無効化していて通知が届かない事象があったため追加)。
 *
 * 🔴 **送信が成功しても通知が出るとは限らない**。Apple の Web Push は、購読が実質無効に
 * なっていても 2xx を返し続けることがあり(404/410 も返らない)、アプリ側からは成功に見える。
 * 最終的な判断は「端末に通知が見えたか」なので、文面でも登録し直しを案内する。
 */
export async function sendTestPushToThisDevice(endpoint: string): Promise<ActionResult> {
  const me = await requireEmployee();

  const parsed = z.url().max(1000).safeParse(endpoint);
  if (!parsed.success) return { ok: false, message: "端末の情報が正しくありません" };

  const supabase = await createClient();
  // RLS により自分の購読しか読めない(他人の端末には送れない)
  const { data: sub, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("endpoint", parsed.data)
    .maybeSingle();

  if (error) return { ok: false, message: "端末の情報を取得できませんでした" };
  if (!sub) {
    return {
      ok: false,
      message: "この端末はまだ登録されていません。「この端末で通知を受け取る」を押してからお試しください。",
    };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();
  if (!publicKey || !privateKey) {
    return { ok: false, message: "通知用の鍵（VAPID）が未設定のため送れません。" };
  }

  const message = JSON.stringify({
    title: "テスト通知",
    body: "この端末で通知を受け取れています。",
    tag: "test-notification",
    url: me.is_admin ? "/admin/account" : "/account",
  });
  const res = await sendPush(sub, message, { publicKey, privateKey, subject });

  if (res.expired) {
    // 失効が分かった購読は残しておいても届かないので消す(登録し直してもらう)
    await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data);
    revalidatePath("/account");
    revalidatePath("/admin/account");
    return {
      ok: false,
      message: "この端末の登録は無効になっていました。登録を消したので、「この端末で通知を受け取る」でもう一度登録してください。",
    };
  }
  if (!res.ok) {
    return { ok: false, message: `送信に失敗しました（${res.error ?? `状態コード ${res.status}`}）` };
  }
  return {
    ok: true,
    // 送信先(Apple/Google)と状態コードを添える。届かないときに「送信は受理された=端末側の設定の問題」
    // と切り分けるため(2026-09-26 Chrome の PWA で届かない件の調査で追加)。
    message:
      "テスト通知を送りました。数秒待っても届かない場合は、「この端末への通知を解除する」→「この端末で通知を受け取る」で登録し直してください。" +
      `（送信先 ${new URL(sub.endpoint).host} / 状態コード ${res.status}）`,
  };
}

/**
 * 通知対象(未打刻の出勤/退勤・初回ログイン)のスイッチ。管理者のみ変更可能。
 * 以前は admin/settings 画面にあった単一スイッチを、出勤/退勤で分離して
 * アカウント設定画面に移動した(2026-08-06)。初回ログイン通知は2026-08-08追加。
 * 営業カレンダーの作成(毎月15日の自動作成)は2026-09-18追加。
 */
export async function updateNotifyTypeSettings(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const notifyIn = formData.get("notify_missing_punch_in") === "on";
  const notifyOut = formData.get("notify_missing_punch_out") === "on";
  const notifyFirstLogin = formData.get("notify_first_login") === "on";
  const notifyBusinessCalendar = formData.get("notify_business_calendar") === "on";

  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "notify_missing_punch_in", value: notifyIn ? "true" : "false" },
      { key: "notify_missing_punch_out", value: notifyOut ? "true" : "false" },
      { key: "notify_first_login", value: notifyFirstLogin ? "true" : "false" },
      { key: "notify_business_calendar", value: notifyBusinessCalendar ? "true" : "false" },
    ],
    { onConflict: "key" }
  );

  if (error) return { ok: false, message: "保存に失敗しました" };

  await logActivity(
    "notify_settings_update",
    `未打刻通知: 出勤=${notifyIn ? "有効" : "無効"} / 退勤=${notifyOut ? "有効" : "無効"} / ` +
      `初回ログイン=${notifyFirstLogin ? "有効" : "無効"} / ` +
      `営業カレンダーの作成=${notifyBusinessCalendar ? "有効" : "無効"}`
  );

  revalidatePath("/admin/account");
  return { ok: true, message: "通知設定を更新しました" };
}

/**
 * 自分のシフト通知(「開始の N 分前」「終了の N 分前(マイナスは N 分後)」)を保存する(管理者・従業員共通)。
 * 両方オフなら行を消す。送信は pg_cron の run_shift_reminder_job() が行う。
 */
export async function updateMyShiftReminder(formData: FormData): Promise<ActionResult> {
  const me = await requireEmployee();
  const startOn = formData.get("shift_reminder_enabled") === "on";
  const endOn = formData.get("shift_end_reminder_enabled") === "on";

  let start: number | null = null;
  let end: number | null = null;
  if (startOn) {
    start = Number(formData.get("shift_reminder_minutes"));
    if (!Number.isInteger(start) || start < 5 || start > 720) {
      return { ok: false, message: "開始の通知の分数は5〜720の整数で入力してください" };
    }
  }
  if (endOn) {
    end = Number(formData.get("shift_end_reminder_minutes"));
    if (formData.get("shift_end_reminder_minutes") === "" || !Number.isInteger(end) || end < -720 || end > 720) {
      return { ok: false, message: "終了の通知の分数は-720〜720の整数で入力してください" };
    }
  }

  const supabase = await createClient();
  const { error } =
    start === null && end === null
      ? await supabase.from("shift_reminder_settings").delete().eq("employee_id", me.id)
      : await supabase.from("shift_reminder_settings").upsert(
          {
            employee_id: me.id,
            minutes_before: start,
            end_minutes_before: end,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "employee_id" }
        );
  if (error) return { ok: false, message: "保存に失敗しました" };

  await logActivity(
    "通知設定",
    `シフトの通知: 開始=${start === null ? "無効" : `${start}分前`} / 終了=${
      end === null ? "無効" : end >= 0 ? `${end}分前` : `${-end}分後`
    }`
  );

  revalidatePath("/account");
  revalidatePath("/admin/account");
  return { ok: true, message: "通知設定を保存しました" };
}

/**
 * シフトのカレンダー購読URLを作り直す(管理者・従業員共通)。古いURLは無効になり、
 * 登録済みのカレンダーアプリには以後シフトが届かなくなる(新しいURLで登録し直してもらう)。
 */
export async function rotateMyCalendarToken(): Promise<ActionResult> {
  await requireEmployee();
  const supabase = await createClient();

  const { error } = await supabase.rpc("my_calendar_token", { p_rotate: true });
  if (error) return { ok: false, message: "URLの作り直しに失敗しました" };

  await logActivity("カレンダーURL再発行", "本人がシフトのカレンダー購読URLを作り直した");

  revalidatePath("/account");
  revalidatePath("/admin/account");
  return {
    ok: true,
    message: "URLを作り直しました。カレンダーアプリには新しいURLで登録し直してください。",
  };
}
