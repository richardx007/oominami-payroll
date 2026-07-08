"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { sendMailToMany } from "@/lib/email";
import type { ActionResult } from "../employees/actions";

const noticeSchema = z.object({
  recipient_id: z.string(), // "" = 全員
  type: z.enum(["individual", "broadcast", "reminder"]),
  subject: z.string().min(1, "件名を入力してください").max(100),
  body: z.string().min(1, "本文を入力してください").max(2000),
  send_email: z.string().optional(), // "on" ならメールも送信
});

export async function sendNotice(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = noticeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  // 宛先が空 = 全員(一斉報知)。宛先を選べば個別。どちらも有効なので追加の制約は不要。

  const supabase = await createClient();

  // メール併送する場合の宛先を取得
  let emailInfo = "";
  let emailed = false;
  if (d.send_email === "on") {
    let query = supabase
      .from("employees")
      .select("email")
      .eq("status", "active")
      .eq("is_admin", false);
    if (d.recipient_id) query = query.eq("id", d.recipient_id);
    const { data: recipients } = await query;

    const emails = (recipients ?? []).map((r) => r.email);
    if (emails.length === 0) {
      emailInfo = " / メール対象の従業員がいません";
    } else {
      const { sent, failed } = await sendMailToMany(
        emails,
        d.subject,
        d.body + "\n\n(給与管理システムからのお知らせです)"
      );
      emailed = sent > 0;
      emailInfo =
        failed.length > 0
          ? ` / メール${sent}件送信、${failed.length}件失敗(${failed[0].reason})`
          : ` / メール${sent}件送信`;
    }
  }

  const { error } = await supabase.from("notifications").insert({
    sender_id: admin.id,
    recipient_id: d.recipient_id || null,
    type: d.recipient_id ? d.type : "broadcast",
    subject: d.subject,
    body: d.body,
    emailed,
  });

  if (error) return { ok: false, message: "送信に失敗しました" };

  revalidatePath("/admin/notices");
  return {
    ok: true,
    message:
      (d.recipient_id
        ? "個別連絡を送信しました(アプリ内お知らせに表示)"
        : "全員宛てに送信しました(アプリ内お知らせに表示)") + emailInfo,
  };
}
