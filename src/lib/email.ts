import { smtpSendMail, type MailAttachment } from "./smtp";
import { createClient } from "./supabase/server";

/**
 * メール送信(Gmail SMTP)
 *
 * Cloudflare Workers 上で Gmail の SMTP(smtp.gmail.com:465)を使う。
 * - 送信元アドレス・税理士アドレス・会社名は app_settings(DB)から取得(管理画面で変更可)
 *   DB が空の場合は環境変数(GMAIL_USER / TAX_ACCOUNTANT_EMAIL)をフォールバックに使う
 * - GMAIL_APP_PASSWORD(アプリパスワード)のみ環境変数(Secret)で管理
 */

export type MailResult = { ok: boolean; message: string };

/** app_settings から値を取得(管理者コンテキストで呼ばれる前提) */
async function getSetting(key: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const v = data?.value?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

/** 送信元Gmailアドレス(DB → 環境変数の順) */
export async function getSenderEmail(): Promise<string | null> {
  return (await getSetting("gmail_user")) || process.env.GMAIL_USER || null;
}

/** 税理士の送付先アドレス(DB → 環境変数の順) */
export async function getTaxEmail(): Promise<string | null> {
  return (
    (await getSetting("tax_accountant_email")) ||
    process.env.TAX_ACCOUNTANT_EMAIL ||
    null
  );
}

/** 税理士の氏名(メール冒頭の宛名に使用) */
export async function getTaxName(): Promise<string | null> {
  return await getSetting("tax_accountant_name");
}

/** 管理者のメールアドレス一覧(個別連絡のCC・全員通知の送付先に使用) */
export async function getAdminEmails(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("employees")
      .select("email")
      .eq("status", "active")
      .eq("is_admin", true);
    return (data ?? [])
      .map((r) => r.email?.trim())
      .filter((e): e is string => !!e);
  } catch {
    return [];
  }
}

/** 会社名(メール差出人名・帳票見出しに使用) */
export async function getCompanyName(): Promise<string> {
  return (await getSetting("company_name")) || "給与管理システム";
}

export async function sendMail(params: {
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<MailResult> {
  const [user, fromName] = await Promise.all([
    getSenderEmail(),
    getCompanyName(),
  ]);
  const password = process.env.GMAIL_APP_PASSWORD;

  if (!user || !password) {
    return {
      ok: false,
      message: !user
        ? "送信元Gmailが未設定です(設定画面で登録してください)"
        : "アプリパスワードが未設定です(CloudflareでGMAIL_APP_PASSWORDをSecret登録してください)",
    };
  }

  // SMTP接続は一時的に失敗することがあるため最大2回まで再試行する
  let lastDetail = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await smtpSendMail({
        host: "smtp.gmail.com",
        port: 465,
        username: user,
        password,
        fromName,
        to: params.to,
        cc: params.cc,
        subject: params.subject,
        text: params.text,
        attachments: params.attachments,
      });
      return { ok: true, message: "送信しました" };
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : String(e);
      if (lastDetail.includes("cloudflare")) {
        return {
          ok: false,
          message: "メール送信に失敗しました(本番環境(Cloudflare)でのみ送信できます)",
        };
      }
      // 次の試行まで少し待つ
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { ok: false, message: `メール送信に失敗しました(${lastDetail})` };
}

/** 複数宛先に順次送信(Gmail無料枠を考慮しシンプルに直列) */
export async function sendMailToMany(
  recipients: string[],
  subject: string,
  text: string
): Promise<{ sent: number; failed: { to: string; reason: string }[] }> {
  let sent = 0;
  const failed: { to: string; reason: string }[] = [];
  for (const to of recipients) {
    const result = await sendMail({ to, subject, text });
    if (result.ok) sent += 1;
    else failed.push({ to, reason: result.message });
  }
  return { sent, failed };
}

/** 給与明細メールの本文を生成 */
export function buildPayslipMailText(params: {
  name: string;
  periodLabel: string;
  paymentDate: string;
  workDays: number;
  totalMinutes: number;
  hourlyWage: number;
  basePay: number;
  transportTotal: number;
  lunchTotal: number;
  grossPay: number;
  incomeTax: number;
  netPay: number;
  taxCategory: string;
}): string {
  const yen = (n: number) => `${n.toLocaleString()}円`;
  const hours = `${Math.floor(params.totalMinutes / 60)}時間${params.totalMinutes % 60 > 0 ? `${params.totalMinutes % 60}分` : ""}`;
  return [
    `${params.name} 様`,
    "",
    `${params.periodLabel}の給与明細をお知らせします。`,
    "",
    `【${params.periodLabel} 給与明細】`,
    `支払日: ${params.paymentDate.replaceAll("-", "/")}`,
    "",
    `勤務日数: ${params.workDays}日`,
    `勤務時間: ${hours || "0時間"}`,
    `基本給(時給${yen(params.hourlyWage)}): ${yen(params.basePay)}`,
    `交通費: ${yen(params.transportTotal)}`,
    `昼食補助: ${yen(params.lunchTotal)}`,
    `総支給額: ${yen(params.grossPay)}`,
    `源泉所得税(${params.taxCategory === "kou" ? "甲欄" : "乙欄"}): -${yen(params.incomeTax)}`,
    `差引支給額: ${yen(params.netPay)}`,
    "",
    "詳細はアプリの「給与明細」からもご確認いただけます。",
  ].join("\n");
}
