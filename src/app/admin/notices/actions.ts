"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminEmails, sendMail, sendMailToMany } from "@/lib/email";
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
    const mailBody = d.body + "\n\n(給与管理システムからのお知らせです)";
    const adminEmails = await getAdminEmails();

    if (d.recipient_id) {
      // 個別連絡: 対象従業員へ送信し、管理者を CC に列挙する
      const { data: target } = await supabase
        .from("employees")
        .select("email")
        .eq("status", "active")
        .eq("id", d.recipient_id)
        .maybeSingle();

      const to = target?.email;
      if (!to) {
        emailInfo = " / メール対象の従業員がいません";
      } else {
        const res = await sendMail({
          to,
          cc: adminEmails.filter((a) => a !== to),
          subject: d.subject,
          text: mailBody,
        });
        emailed = res.ok;
        emailInfo = res.ok
          ? ` / メール送信(管理者CC ${adminEmails.filter((a) => a !== to).length}名)`
          : ` / メール送信失敗(${res.message})`;
      }
    } else {
      // 全員通知: 全従業員に加えて管理者にも送信する
      const { data: recipients } = await supabase
        .from("employees")
        .select("email")
        .eq("status", "active")
        .eq("is_admin", false);

      const emails = (recipients ?? []).map((r) => r.email);
      // 管理者を重複なく宛先に追加
      for (const a of adminEmails) if (!emails.includes(a)) emails.push(a);

      if (emails.length === 0) {
        emailInfo = " / メール対象の従業員がいません";
      } else {
        const { sent, failed } = await sendMailToMany(
          emails,
          d.subject,
          mailBody
        );
        emailed = sent > 0;
        emailInfo =
          failed.length > 0
            ? ` / メール${sent}件送信、${failed.length}件失敗(${failed[0].reason})`
            : ` / メール${sent}件送信(管理者含む)`;
      }
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
