"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { periodFromKey, type Period } from "@/lib/period";
import {
  getCompanyName,
  getTaxEmail,
  getTaxName,
  sendMail,
} from "@/lib/email";

type PayRow = {
  work_days: number;
  night_minutes: number;
  base_pay: number;
  night_pay: number;
  transport_total: number;
  lunch_total: number;
  gross_pay: number;
  income_tax: number;
  net_pay: number;
  tax_category: string;
  emp: { employee_no: string; name: string };
};

type LoadedReport =
  | {
      ok: true;
      period: Period;
      periodLabel: string;
      paymentDate: string;
      rows: PayRow[];
    }
  | { ok: false; message: string };

/** 締め済み期間の支給明細を取得(CSV生成・メール送信で共用) */
async function loadReport(periodKey: string): Promise<LoadedReport> {
  const period = periodFromKey(periodKey);
  if (!period) return { ok: false, message: "期間の指定が不正です" };

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
      `work_days, total_minutes, night_minutes, base_pay, night_pay, transport_total,
       lunch_total, gross_pay, income_tax, net_pay, tax_category,
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

  return {
    ok: true,
    period,
    periodLabel: payPeriod.period_label,
    paymentDate: payPeriod.payment_date,
    rows: rows as PayRow[],
  };
}

/** 支給一覧の CSV(BOM付き)文字列を生成 */
function buildCsv(rows: PayRow[]): string {
  const totals = rows.reduce(
    (acc, r) => ({
      nightPay: acc.nightPay + r.night_pay,
      transport: acc.transport + r.transport_total,
      lunch: acc.lunch + r.lunch_total,
      gross: acc.gross + r.gross_pay,
      tax: acc.tax + r.income_tax,
      net: acc.net + r.net_pay,
    }),
    { nightPay: 0, transport: 0, lunch: 0, gross: 0, tax: 0, net: 0 }
  );

  const header = [
    "従業員No",
    "氏名",
    "勤務日数",
    "基本給",
    "深夜勤務手当",
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
      r.night_pay,
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
    totals.nightPay,
    totals.transport,
    totals.lunch,
    totals.gross,
    totals.tax,
    totals.net,
    "",
  ].join(",");
  // Excelで文字化けしないよう先頭にBOMを付与
  return "﻿" + [header, ...body, total].join("\r\n") + "\r\n";
}

export type TaxReportCsv =
  | { ok: true; filename: string; csv: string }
  | { ok: false; message: string };

/** 税理士向け支給一覧の CSV(BOM付き)を生成して返す(手動ダウンロード用) */
export async function buildTaxReportCsv(
  periodKey: string
): Promise<TaxReportCsv> {
  await requireAdmin();
  const loaded = await loadReport(periodKey);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    filename: `payroll_${loaded.period.key}.csv`,
    csv: buildCsv(loaded.rows),
  };
}

export type SendResult = { ok: boolean; message: string };

/**
 * 税理士へ支給一覧CSVを添付して自動送信する。
 * - メール冒頭は「(税理士名) 様」(未設定時は「税理士 御中」)
 * - 本文に勤務データの表は載せず、明細は添付CSVに委ねる
 * - note(申し送り事項)があれば本文に追記する
 */
export async function sendTaxReport(
  periodKey: string,
  note: string
): Promise<SendResult> {
  await requireAdmin();

  const to = await getTaxEmail();
  if (!to) {
    return {
      ok: false,
      message: "税理士のメールアドレスが未設定です(設定画面で登録してください)",
    };
  }

  const loaded = await loadReport(periodKey);
  if (!loaded.ok) return loaded;

  const [taxName, companyName] = await Promise.all([
    getTaxName(),
    getCompanyName(),
  ]);

  const greeting = taxName?.trim() ? `${taxName.trim()} 様` : "税理士 御中";
  const trimmedNote = (note ?? "").trim();

  const lines = [
    greeting,
    "",
    "いつもお世話になっております。",
    `${loaded.periodLabel}の給与支給一覧をお送りします。`,
    `対象期間: ${loaded.period.start.replaceAll("-", "/")}〜${loaded.period.end.replaceAll("-", "/")} / 支給日: ${loaded.paymentDate.replaceAll("-", "/")}`,
    "詳細は添付のCSVファイル(支給一覧)をご確認ください。",
  ];
  if (trimmedNote) {
    lines.push("", "【申し送り事項】", trimmedNote);
  }
  lines.push("", companyName);

  return await sendMail({
    to,
    subject: `【給与支給一覧】${loaded.periodLabel}`,
    text: lines.join("\n"),
    attachments: [
      {
        filename: `payroll_${loaded.period.key}.csv`,
        content: buildCsv(loaded.rows),
        contentType: "text/csv",
      },
    ],
  });
}
