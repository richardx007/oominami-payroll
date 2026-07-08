"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { periodFromKey } from "@/lib/period";
import { getSenderEmail, getTaxEmail } from "@/lib/email";
import type { ActionResult } from "../employees/actions";

export type TaxReportMail =
  | { ok: true; to: string; cc: string; subject: string; body: string }
  | { ok: false; message: string };

/**
 * 税理士宛ての支給一覧メールの内容(宛先・件名・本文)を組み立てて返す。
 * 直接送信はせず、クライアント側で mailto: を開いて内容確認・追記できるようにする。
 * CC に送信元アドレスを入れ、送った内容が手元にも残るようにする。
 */
export async function buildTaxReportMail(
  periodKey: string
): Promise<TaxReportMail> {
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
  const cc = (await getSenderEmail()) ?? "";

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

  return {
    ok: true,
    to,
    cc,
    subject: `【給与支給一覧】${payPeriod.period_label}`,
    body: lines.join("\n"),
  };
}

export type TaxReportCsv =
  | { ok: true; filename: string; csv: string }
  | { ok: false; message: string };

/**
 * 税理士向け支給一覧の CSV(BOM付き)を生成して返す。
 * mailto では添付できないため、ダウンロードして手動でメールに添付できるようにする。
 */
export async function buildTaxReportCsv(
  periodKey: string
): Promise<TaxReportCsv> {
  await requireAdmin();
  const period = periodFromKey(periodKey);
  if (!period) return { ok: false, message: "期間の指定が不正です" };

  const supabase = await createClient();
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("id, period_label")
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

  const totals = rows.reduce(
    (acc, r) => ({
      base: acc.base + r.base_pay,
      transport: acc.transport + r.transport_total,
      lunch: acc.lunch + r.lunch_total,
      gross: acc.gross + r.gross_pay,
      tax: acc.tax + r.income_tax,
      net: acc.net + r.net_pay,
    }),
    { base: 0, transport: 0, lunch: 0, gross: 0, tax: 0, net: 0 }
  );

  const header = [
    "従業員No",
    "氏名",
    "勤務日数",
    "基本給",
    "交通費",
    "昼食補助",
    "総支給額",
    "源泉所得税",
    "差引支給額",
    "税区分",
  ].join(",");
  const body = rows.map((r) =>
    [
      r.emp.employee_no,
      `"${r.emp.name.replace(/"/g, '""')}"`,
      r.work_days,
      r.base_pay,
      r.transport_total,
      r.lunch_total,
      r.gross_pay,
      r.income_tax,
      r.net_pay,
      r.tax_category === "kou" ? "甲" : "乙",
    ].join(",")
  );
  const total = [
    "合計",
    `"${rows.length}名"`,
    "",
    "",
    totals.transport,
    totals.lunch,
    totals.gross,
    totals.tax,
    totals.net,
    "",
  ].join(",");
  // Excelで文字化けしないよう先頭にBOMを付与
  const csv = "﻿" + [header, ...body, total].join("\r\n") + "\r\n";

  return { ok: true, filename: `payroll_${period.key}.csv`, csv };
}
