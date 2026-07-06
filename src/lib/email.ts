import { smtpSendMail } from "./smtp";

/**
 * メール送信(Gmail SMTP)
 *
 * Cloudflare Workers 上で Gmail の SMTP(smtp.gmail.com:465)を使う。
 * 必要な環境変数(Workers の Secrets に設定):
 * - GMAIL_USER: 送信元 Gmail アドレス
 * - GMAIL_APP_PASSWORD: Google アカウントの「アプリパスワード」(2段階認証が必要)
 *
 * 未設定の場合やローカル開発時は送信せずエラーメッセージを返す(アプリ内通知は動く)。
 */

export type MailResult = { ok: boolean; message: string };

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<MailResult> {
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;

  if (!user || !password) {
    return {
      ok: false,
      message:
        "メール未設定(GMAIL_USER / GMAIL_APP_PASSWORD を設定してください)",
    };
  }

  try {
    await smtpSendMail({
      host: "smtp.gmail.com",
      port: 465,
      username: user,
      password,
      fromName: "給与管理システム",
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return { ok: true, message: "送信しました" };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `メール送信に失敗しました(${detail.includes("cloudflare") ? "本番環境(Cloudflare)でのみ送信できます" : detail})`,
    };
  }
}

/** 複数宛先に順次送信(Gmail無料枠を考慮しシンプルに直列) */
export async function sendMailToMany(
  recipients: string[],
  subject: string,
  text: string
): Promise<{ sent: number; failed: string[] }> {
  let sent = 0;
  const failed: string[] = [];
  for (const to of recipients) {
    const result = await sendMail({ to, subject, text });
    if (result.ok) sent += 1;
    else failed.push(to);
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
