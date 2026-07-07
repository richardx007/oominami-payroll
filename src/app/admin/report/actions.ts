"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { periodFromKey } from "@/lib/period";
import { getTaxEmail, sendMail } from "@/lib/email";
import type { ActionResult } from "../employees/actions";

/** 税理士宛てに給与支給一覧(テキスト)をメール送信する */
export async function sendTaxReport(periodKey: string): Promise<ActionResult> {
  await requireAdmin();
  const period = periodFromKey(periodKey);
  if (!period) return { ok: false, message: "期間の指定が不正です" };

  const to = await getTaxEmail();
  if (!to) {
    return {
      ok: false,
      message:
        "税理士のメールアドレスが未設定です(設定画面で登録してください)",
    };
  }

  const supabase = await createClient();
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("id, period_label, payment_date, status")
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .neq("status", "open")
    .maybeSingle();

  if (!payPeriod) {
    return { ok: false, message: "先に締め処理を実行してください" };
  }

  const { data: payslips } = await supabase
    .from("payslips")
    .select(
      `work_days, total_minutes, base_pay, transport_total, lunch_total,
       gross_pay, income_tax, net_pay, tax_category,
       employees ( employee_no, name )`
    )
    .eq("pay_period_id", payPeriod.id);

  const rows = (payslips ?? [])
    .map((r) => ({
      ...r,
      emp: r.employees as unknown as { employee_no: string; name: string },
    }))
    .sort((a, b) => a.emp.employee_no.localeCompare(b.emp.employee_no));

  if (rows.length === 0) {
    return { ok: false, message: "明細データがありません" };
  }

  const yen = (n: number) => n.toLocaleString();
  const totals = rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross_pay,
      tax: acc.tax + r.income_tax,
      net: acc.net + r.net_pay,
    }),
    { gross: 0, tax: 0, net: 0 }
  );

  const lines = [
    "税理士 御中",
    "",
    `${payPeriod.period_label}の給与支給一覧をお送りします。`,
    `対象期間: ${period.start.replaceAll("-", "/")}〜${period.end.replaceAll("-", "/")} / 支給日: ${payPeriod.payment_date.replaceAll("-", "/")}`,
    "",
    "No / 氏名 / 勤務日数 / 基本給 / 交通費 / 昼食補助 / 総支給 / 源泉所得税 / 差引支給 / 税区分",
    "-".repeat(60),
    ...rows.map((r) =>
      [
        r.emp.employee_no,
        r.emp.name,
        `${r.work_days}日`,
        yen(r.base_pay),
        yen(r.transport_total),
        yen(r.lunch_total),
        yen(r.gross_pay),
        yen(r.income_tax),
        yen(r.net_pay),
        r.tax_category === "kou" ? "甲" : "乙",
      ].join(" / ")
    ),
    "-".repeat(60),
    `合計(${rows.length}名): 総支給 ${yen(totals.gross)}円 / 源泉所得税 ${yen(totals.tax)}円 / 差引支給 ${yen(totals.net)}円`,
    "",
    "(単位: 円。給与管理システムより自動送信)",
  ];

  const result = await sendMail({
    to,
    subject: `【給与支給一覧】${payPeriod.period_label}`,
    text: lines.join("\n"),
  });

  if (!result.ok) return result;

  await supabase.from("tax_reports").insert({
    pay_period_id: payPeriod.id,
    emailed_to: to,
    emailed_at: new Date().toISOString(),
  });

  revalidatePath("/admin/report");
  return { ok: true, message: `税理士(${to})に送信しました` };
}
