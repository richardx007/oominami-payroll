"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod, periodFromKey, type Period } from "@/lib/period";
import { calculatePeriodPayroll } from "@/lib/payroll-data";
import {
  buildTaxGreetingLines,
  getCompanyName,
  getTaxEmail,
  getTaxName,
  sendMail,
} from "@/lib/email";

export type PayRow = {
  work_days: number;
  total_minutes: number;
  night_minutes: number;
  overtime_minutes: number;
  hourly_wage: number;
  base_pay: number;
  night_pay: number;
  overtime_pay: number;
  transport_total: number;
  lunch_total: number;
  gross_pay: number;
  income_tax: number;
  advance_deduction: number;
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
      `work_days, total_minutes, night_minutes, overtime_minutes, hourly_wage, base_pay, night_pay,
       overtime_pay, transport_total, lunch_total, gross_pay, income_tax, advance_deduction,
       net_pay, tax_category, employees ( employee_no, name )`
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

/** 分を「H:MM」表記にする(CSV用) */
function hhmmCsv(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** 支給一覧の CSV(BOM付き)文字列を生成 */
function buildCsv(rows: PayRow[]): string {
  const totals = rows.reduce(
    (acc, r) => ({
      totalMinutes: acc.totalMinutes + r.total_minutes,
      nightMinutes: acc.nightMinutes + r.night_minutes,
      nightPay: acc.nightPay + r.night_pay,
      overtimeMinutes: acc.overtimeMinutes + r.overtime_minutes,
      overtimePay: acc.overtimePay + r.overtime_pay,
      transport: acc.transport + r.transport_total,
      lunch: acc.lunch + r.lunch_total,
      gross: acc.gross + r.gross_pay,
      tax: acc.tax + r.income_tax,
      advance: acc.advance + r.advance_deduction,
      net: acc.net + r.net_pay,
    }),
    {
      totalMinutes: 0,
      nightMinutes: 0,
      nightPay: 0,
      overtimeMinutes: 0,
      overtimePay: 0,
      transport: 0,
      lunch: 0,
      gross: 0,
      tax: 0,
      advance: 0,
      net: 0,
    }
  );

  const header = [
    "従業員No",
    "氏名",
    "勤務日数",
    "勤務時間",
    "うち深夜",
    "うち残業",
    "基本時給",
    "基本給",
    "深夜勤務手当",
    "残業手当",
    "交通費",
    "昼食補助",
    "総支給額",
    "源泉所得税",
    "前払金控除",
    "差引支給額",
    "税区分",
  ].join(",");
  const body = rows.map((r) =>
    [
      r.emp.employee_no,
      `"${r.emp.name.replace(/"/g, '""')}"`,
      r.work_days,
      hhmmCsv(r.total_minutes),
      hhmmCsv(r.night_minutes),
      hhmmCsv(r.overtime_minutes),
      r.hourly_wage,
      r.base_pay,
      r.night_pay,
      r.overtime_pay,
      r.transport_total,
      r.lunch_total,
      r.gross_pay,
      r.income_tax,
      r.advance_deduction,
      r.net_pay,
      r.tax_category === "kou" ? "甲" : "乙",
    ].join(",")
  );
  const total = [
    "合計",
    `"${rows.length}名"`,
    "",
    hhmmCsv(totals.totalMinutes),
    hhmmCsv(totals.nightMinutes),
    hhmmCsv(totals.overtimeMinutes),
    "",
    "",
    totals.nightPay,
    totals.overtimePay,
    totals.transport,
    totals.lunch,
    totals.gross,
    totals.tax,
    totals.advance,
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

export type PreviewRows =
  | { ok: true; periodLabel: string; companyName: string; rows: PayRow[] }
  | { ok: false; message: string };

/**
 * 税理士向けPDF添付を作るためのプレビュー行を返す(締め済み期間・CSVと同じ元データ)。
 * PDF自体はブラウザ側(html2canvas+jsPDF)でしか作れないため、送信直前にこれを呼び、
 * 返った行を画面外のテーブルに描画してキャプチャし、base64にしてから送信アクションへ渡す。
 */
export async function previewTaxReportRows(periodKey: string): Promise<PreviewRows> {
  await requireAdmin();
  const loaded = await loadReport(periodKey);
  if (!loaded.ok) return loaded;
  const companyName = await getCompanyName();
  return { ok: true, periodLabel: loaded.periodLabel, companyName, rows: loaded.rows };
}

/** テスト送信のPDF添付用プレビュー行(締め前・当月の現時点情報) */
export async function previewTaxReportTestRows(): Promise<PreviewRows> {
  await requireAdmin();
  const period = currentPeriod();
  const [payrolls, companyName] = await Promise.all([
    calculatePeriodPayroll(period, { ignoreIncomplete: true }),
    getCompanyName(),
  ]);
  const rows: PayRow[] = payrolls
    .filter((p) => p.result !== null)
    .map((p) => ({
      ...(p.result as NonNullable<typeof p.result>),
      emp: { employee_no: p.employee_no, name: p.name },
    }))
    .sort((a, b) => a.emp.employee_no.localeCompare(b.emp.employee_no));
  return { ok: true, periodLabel: period.label, companyName, rows };
}

/** メール添付用のPDF(base64・既にブラウザ側でキャプチャ済み)。任意 */
type PdfAttachment = { base64: string; filename: string };

/**
 * 税理士へ支給一覧CSV(+任意でPDF)を添付して自動送信する。
 * - メール冒頭は税理士名の宛名行(1行目:事務所名/2行目:氏名+「様」、未設定時は「税理士 御中」)
 * - 本文に勤務データの表は載せず、明細は添付CSV(・PDF)に委ねる
 * - note(申し送り事項)があれば本文に追記する
 * - PDFはブラウザ側で `previewTaxReportRows` の結果をキャプチャして作るため、失敗時は
 *   pdf を省略してもCSVのみで送信を続行できるようにしている(呼び出し側の責務)
 */
export async function sendTaxReport(
  periodKey: string,
  note: string,
  pdf?: PdfAttachment
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

  const trimmedNote = (note ?? "").trim();

  const lines = [
    ...buildTaxGreetingLines(taxName),
    "",
    "いつもお世話になっております。",
    `${loaded.periodLabel}の給与支給一覧をお送りします。`,
    `対象期間: ${loaded.period.start.replaceAll("-", "/")}〜${loaded.period.end.replaceAll("-", "/")} / 支給日: ${loaded.paymentDate.replaceAll("-", "/")}`,
    `詳細は添付の${pdf ? "PDF・CSVファイル" : "CSVファイル"}(支給一覧)をご確認ください。`,
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
      ...(pdf
        ? [
            {
              filename: pdf.filename,
              content: pdf.base64,
              contentType: "application/pdf",
              encoding: "base64" as const,
            },
          ]
        : []),
    ],
  });
}

const testSendEmailSchema = z.email(
  "テスト送信先のメールアドレスの形式が正しくありません"
);

/**
 * 税理士向けメールのテスト送信(設定画面から実行)。
 * - 締め処理を待たず、当月(締め前でも現時点)の期間を対象に work_entries 等から都度計算する
 *   (previewTaxReportTestRows = calculatePeriodPayroll + ignoreIncomplete。
 *   close/page.tsx のプレビューと同じ方式)
 * - 実際の締め処理(payslips確定)は一切行わない
 * - 件名の冒頭に「【テスト送信】」を付与する
 */
export async function sendTaxReportTest(
  testEmail: string,
  pdf?: PdfAttachment
): Promise<SendResult> {
  await requireAdmin();

  const parsed = testSendEmailSchema.safeParse(testEmail.trim());
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const to = parsed.data;

  const period = currentPeriod();
  const preview = await previewTaxReportTestRows();
  if (!preview.ok) return preview;
  const { rows, companyName } = preview;

  const taxName = await getTaxName();

  const lines = [
    ...buildTaxGreetingLines(taxName),
    "",
    "いつもお世話になっております。",
    `${period.label}の給与支給一覧をお送りします。(テスト送信・締め前の現時点情報です)`,
    `対象期間: ${period.start.replaceAll("-", "/")}〜${period.end.replaceAll("-", "/")} / 支給日: ${period.paymentDate.replaceAll("-", "/")}`,
    `詳細は添付の${pdf ? "PDF・CSVファイル" : "CSVファイル"}(支給一覧)をご確認ください。`,
    "",
    companyName,
  ];

  return await sendMail({
    to,
    subject: `【テスト送信】【給与支給一覧】${period.label}`,
    text: lines.join("\n"),
    attachments: [
      {
        filename: `payroll_${period.key}_test.csv`,
        content: buildCsv(rows),
        contentType: "text/csv",
      },
      ...(pdf
        ? [
            {
              filename: pdf.filename,
              content: pdf.base64,
              contentType: "application/pdf",
              encoding: "base64" as const,
            },
          ]
        : []),
    ],
  });
}
