"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireEmployee } from "@/lib/auth";
import { logActivity } from "@/lib/log";
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
 * 通知対象(未打刻の出勤/退勤・初回ログイン)のスイッチ。管理者のみ変更可能。
 * 以前は admin/settings 画面にあった単一スイッチを、出勤/退勤で分離して
 * アカウント設定画面に移動した(2026-08-06)。初回ログイン通知は2026-08-08追加。
 */
export async function updateNotifyTypeSettings(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const notifyIn = formData.get("notify_missing_punch_in") === "on";
  const notifyOut = formData.get("notify_missing_punch_out") === "on";
  const notifyFirstLogin = formData.get("notify_first_login") === "on";

  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "notify_missing_punch_in", value: notifyIn ? "true" : "false" },
      { key: "notify_missing_punch_out", value: notifyOut ? "true" : "false" },
      { key: "notify_first_login", value: notifyFirstLogin ? "true" : "false" },
    ],
    { onConflict: "key" }
  );

  if (error) return { ok: false, message: "保存に失敗しました" };

  await logActivity(
    "notify_settings_update",
    `未打刻通知: 出勤=${notifyIn ? "有効" : "無効"} / 退勤=${notifyOut ? "有効" : "無効"} / ` +
      `初回ログイン=${notifyFirstLogin ? "有効" : "無効"}`
  );

  revalidatePath("/admin/account");
  return { ok: true, message: "通知設定を更新しました" };
}
