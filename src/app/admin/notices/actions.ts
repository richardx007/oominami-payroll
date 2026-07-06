"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "../employees/actions";

const noticeSchema = z.object({
  recipient_id: z.string(), // "" = 全員
  type: z.enum(["individual", "broadcast", "reminder"]),
  subject: z.string().min(1, "件名を入力してください").max(100),
  body: z.string().min(1, "本文を入力してください").max(2000),
});

export async function sendNotice(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = noticeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  if (!d.recipient_id && d.type === "individual") {
    return { ok: false, message: "個別連絡は宛先を選択してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notifications").insert({
    sender_id: admin.id,
    recipient_id: d.recipient_id || null,
    type: d.recipient_id ? d.type : "broadcast",
    subject: d.subject,
    body: d.body,
    emailed: false, // メール配信はフェーズ4後半で対応
  });

  if (error) return { ok: false, message: "送信に失敗しました" };

  revalidatePath("/admin/notices");
  return {
    ok: true,
    message: d.recipient_id
      ? "個別連絡を送信しました(アプリ内お知らせに表示されます)"
      : "全員宛てに送信しました(アプリ内お知らせに表示されます)",
  };
}
