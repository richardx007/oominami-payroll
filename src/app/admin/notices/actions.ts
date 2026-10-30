"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminEmails, sendMail, sendMailToMany } from "@/lib/email";
import type { ActionResult } from "../employees/actions";
import { WORKING_STATUSES } from "@/lib/employee-status";

const noticeSchema = z.object({
  recipient_id: z.string(), // "" = 全員
  type: z.enum(["individual", "broadcast", "reminder"]),
  subject: z.string().min(1, "件名を入力してください").max(100),
  body: z.string().min(1, "本文を入力してください").max(2000),
  send_email: z.string().optional(), // "on" ならメールも送信
});

export type NoticeResult = ActionResult & {
  /** 全員宛てでメールも送るとき、そのお知らせの id。画面が sendNoticeEmails を少人数ずつ呼んで送る */
  broadcastMailId?: string;
};

export async function sendNotice(formData: FormData): Promise<NoticeResult> {
  const admin = await requireAdmin();

  const parsed = noticeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  // 宛先が空 = 全員(一斉報知)。宛先を選べば個別。どちらも有効なので追加の制約は不要。

  const supabase = await createClient();

  // アプリ内のお知らせを先に保存する(メールの送信が途中で止まっても、お知らせは必ず残るように。
  // 2026-10-30 に全員宛てのメールが途中で止まり、お知らせが保存されなかったため)。メールを送れたかは後で更新する
  const { data: notice, error } = await supabase
    .from("notifications")
    .insert({
      sender_id: admin.id,
      recipient_id: d.recipient_id || null,
      type: d.recipient_id ? d.type : "broadcast",
      subject: d.subject,
      body: d.body,
      emailed: false,
    })
    .select("id")
    .single();
  if (error || !notice) return { ok: false, message: "送信に失敗しました" };
  revalidatePath("/admin/notices");

  if (!d.recipient_id) {
    // 全員宛て: メールは画面が sendNoticeEmails を少人数ずつ呼んで送る(下のコメント参照)
    return {
      ok: true,
      message: "全員宛てに送信しました(アプリ内お知らせに表示)",
      ...(d.send_email === "on" ? { broadcastMailId: notice.id } : {}),
    };
  }

  // 個別連絡: 対象従業員へ送信し、管理者を CC に列挙する
  let emailInfo = "";
  if (d.send_email === "on") {
    const adminEmails = await getAdminEmails();
    const { data: target } = await supabase
      .from("employees")
      .select("email, name, nickname")
      .in("status", WORKING_STATUSES)
      .eq("id", d.recipient_id)
      .maybeSingle();

    const to = target?.email;
    if (!to) {
      emailInfo = " / メール対象の従業員がいません";
    } else {
      const greeting = `${target.nickname || target.name} さん`;
      const mailBody =
        greeting +
        "\n\n" +
        d.body +
        "\n\n(給与管理システムからのお知らせです)";
      const res = await sendMail({
        to,
        cc: adminEmails.filter((a) => a !== to),
        subject: d.subject,
        text: mailBody,
      });
      if (res.ok) {
        await supabase.from("notifications").update({ emailed: true }).eq("id", notice.id);
      }
      emailInfo = res.ok
        ? ` / メール送信(管理者CC ${adminEmails.filter((a) => a !== to).length}名)`
        : ` / メール送信失敗(${res.message})`;
    }
  }

  return {
    ok: true,
    message: "個別連絡を送信しました(アプリ内お知らせに表示)" + emailInfo,
  };
}

export type NoticeMailBatchResult = {
  ok: boolean;
  /** この呼び出しで送れた件数 */
  sent: number;
  /** この呼び出しで送れなかった宛先と理由 */
  failed: string[];
  /** 宛先の総数 */
  total: number;
  /** まだ送っていない宛先が残っているか(true なら offset を進めて呼び直す) */
  hasMore: boolean;
  /** 送る前のエラー(お知らせが見つからない等) */
  error?: string;
};

/**
 * 全員宛てのお知らせのメールを少人数ずつ送る(2026-10-30)。
 *
 * Cloudflare Workers 無料プランの上限対策。給与明細の配信(`emailPayslips`)と同じく、画面が offset を進めながら
 * hasMore が false になるまで呼び直す。
 * - CPU 時間(10ms): 1通ごとに Gmail へ TLS 接続するので、全員を1回で送ると暗号計算が積み上がる(2026-07-29 に給与明細で Error 1102)
 * - 外部への通信(subrequest)は1回50まで: 2026-10-30 に宛先13人を1回で送り、12通目以降(管理者2人)とお知らせの保存が漏れた
 * 送る順は 従業員 → 管理者 → ダミー(テスト用。オーナー依頼)。呼び出しごとに同じ順になるよう並べる。
 */
export async function sendNoticeEmails(
  noticeId: string,
  offset = 0,
  limit = 5
): Promise<NoticeMailBatchResult> {
  await requireAdmin();
  const empty = { sent: 0, failed: [], total: 0, hasMore: false };
  if (!z.uuid().safeParse(noticeId).success) return { ok: false, ...empty, error: "お知らせの指定が不正です" };

  const supabase = await createClient();
  const [{ data: notice }, { data: staffRows }, adminEmails] = await Promise.all([
    supabase.from("notifications").select("id, recipient_id, subject, body").eq("id", noticeId).maybeSingle(),
    supabase
      .from("employees")
      .select("email, status, employee_no")
      .in("status", WORKING_STATUSES)
      .eq("is_admin", false)
      .order("employee_no"),
    getAdminEmails(),
  ]);
  if (!notice || notice.recipient_id) return { ok: false, ...empty, error: "全員宛てのお知らせが見つかりません" };

  const staff = staffRows ?? [];
  const emails: string[] = [];
  const add = (e: string | null | undefined) => {
    const v = e?.trim();
    if (v && !emails.includes(v)) emails.push(v);
  };
  for (const r of staff) if (r.status !== "dummy") add(r.email);
  for (const a of [...adminEmails].sort()) add(a);
  for (const r of staff) if (r.status === "dummy") add(r.email);
  if (emails.length === 0) return { ok: false, ...empty, error: "メール対象の従業員がいません" };

  const targets = emails.slice(offset, offset + limit);
  const mailBody = "従業員のみなさまへ" + "\n\n" + notice.body + "\n\n(給与管理システムからのお知らせです)";
  const { sent, failed } = await sendMailToMany(targets, notice.subject, mailBody);
  if (sent > 0) {
    await supabase.from("notifications").update({ emailed: true }).eq("id", notice.id);
  }
  return {
    ok: failed.length === 0,
    sent,
    failed: failed.map((f) => `${f.to}(${f.reason})`),
    total: emails.length,
    hasMore: offset + limit < emails.length,
  };
}
