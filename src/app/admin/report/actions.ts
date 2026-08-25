"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod, periodFromKey, type Period } from "@/lib/period";
import { calculatePeriodPayroll } from "@/lib/payroll-data";
import {
  buildTaxGreetingLines,
  getCompanyName,
  getManagerName,
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
  taxable_amount: number;
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
      // payslips テーブルに taxable_amount 列は無いため、payroll.ts の計算式
      // (基本給+深夜勤務手当+残業手当+昼食補助。交通費は非課税のため含めない)から算出する
      taxable_amount: r.base_pay + r.night_pay + r.overtime_pay + r.lunch_total,
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

/** 支給一覧の CSV(BOM付き)文字列を生成。総支給額が0の人は出力対象外(給与明細画面には表示したまま) */
function buildCsv(allRows: PayRow[]): string {
  const rows = allRows.filter((r) => r.gross_pay !== 0);
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
      taxable: acc.taxable + r.taxable_amount,
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
      taxable: 0,
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
    "課税対象額",
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
      r.taxable_amount,
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
    totals.taxable,
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

/** 送信本文・CSV・PDFを組み立てるのに必要な情報一式(DB問い合わせは1回だけで済ませる) */
export type ReportData = {
  periodLabel: string;
  companyName: string;
  rows: PayRow[];
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  periodKey: string;
};

export type PreviewRows = ({ ok: true } & ReportData) | { ok: false; message: string };

/**
 * 税理士向けメール(PDF添付・本文・CSV)を作るための元データをまとめて取得する
 * (締め済み期間・CSVと同じ元データ)。DB問い合わせはここで1回だけ行い、返った値を
 * PDFキャプチャにも `sendTaxReport` にもそのまま渡して使い回す
 * (Cloudflare Workers Freeプランのリソース上限対策。二重に問い合わせない)。
 */
export async function previewTaxReportRows(periodKey: string): Promise<PreviewRows> {
  await requireAdmin();
  const loaded = await loadReport(periodKey);
  if (!loaded.ok) return loaded;
  const companyName = await getCompanyName();
  return {
    ok: true,
    periodLabel: loaded.periodLabel,
    companyName,
    rows: loaded.rows,
    periodStart: loaded.period.start,
    periodEnd: loaded.period.end,
    paymentDate: loaded.paymentDate,
    periodKey: loaded.period.key,
  };
}

/** テスト送信用の元データ(締め前・当月の現時点情報)。同上の理由でDB問い合わせは1回だけ */
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
  return {
    ok: true,
    periodLabel: period.label,
    companyName,
    rows,
    periodStart: period.start,
    periodEnd: period.end,
    paymentDate: period.paymentDate,
    periodKey: period.key,
  };
}

/** メール添付用のPDF(base64・既にブラウザ側でキャプチャ済み)。任意 */
type PdfAttachment = { base64: string; filename: string };

/** メール本文末尾の署名行「会社名 責任者名」(責任者名未設定なら会社名のみ) */
function buildSignatureLine(companyName: string, managerName: string): string {
  return managerName.trim() ? `${companyName}　${managerName.trim()}` : companyName;
}

/**
 * 税理士へ支給一覧CSV(+任意でPDF)を添付して自動送信する。
 * - メール冒頭は税理士名の宛名行(1行目:事務所名/2行目:氏名+「様」、未設定時は「税理士 御中」)
 * - 本文に勤務データの表は載せず、明細は添付CSV(・PDF)に委ねる
 * - note(申し送り事項)があれば本文に追記する
 * - data は呼び出し側が事前に `previewTaxReportRows` で取得した結果をそのまま渡す
 *   (このアクション内ではDB問い合わせをしない。Cloudflare Workers Freeプランは
 *   CPU時間10ms・サブリクエスト数の上限が非常に厳しく、PDF添付ぶんの処理が増えた際に
 *   同じ重い問い合わせを2回行うと上限超過でリクエストごと失敗しうるため)
 * - PDFはブラウザ側でキャプチャするため、失敗時は pdf を省略してもCSVのみで
 *   送信を続行できるようにしている(呼び出し側の責務)
 */
export async function sendTaxReport(
  data: ReportData,
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

  const [taxName, managerName] = await Promise.all([
    getTaxName(),
    getManagerName(),
  ]);

  const trimmedNote = (note ?? "").trim();

  const lines = [
    ...buildTaxGreetingLines(taxName),
    "",
    "いつもお世話になっております。",
    `${data.companyName}の${data.periodLabel}　給与支給一覧をお送りします。`,
    `対象期間: ${data.periodStart.replaceAll("-", "/")}〜${data.periodEnd.replaceAll("-", "/")} / 支給日: ${data.paymentDate.replaceAll("-", "/")}`,
    `詳細は添付の${pdf ? "PDF・CSVファイル" : "CSVファイル"}(支給一覧)をご確認ください。`,
  ];
  if (trimmedNote) {
    lines.push("", "【申し送り事項】", trimmedNote);
  }
  lines.push("", buildSignatureLine(data.companyName, managerName));

  return await sendMail({
    to,
    subject: `【給与支給一覧】${data.periodLabel}`,
    text: lines.join("\n"),
    attachments: [
      {
        filename: `payroll_${data.periodKey}.csv`,
        content: buildCsv(data.rows),
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
 * - 締め処理を待たず、当月(締め前でも現時点)の期間を対象にした `previewTaxReportTestRows`
 *   の結果(data)を呼び出し側から受け取る。ここではDB問い合わせをしない(sendTaxReportと同じ理由)
 * - 実際の締め処理(payslips確定)は一切行わない
 * - 件名の冒頭に「【テスト送信】」を付与する
 */
export async function sendTaxReportTest(
  testEmail: string,
  data: ReportData,
  pdf?: PdfAttachment
): Promise<SendResult> {
  await requireAdmin();

  const parsed = testSendEmailSchema.safeParse(testEmail.trim());
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const to = parsed.data;

  const [taxName, managerName] = await Promise.all([
    getTaxName(),
    getManagerName(),
  ]);

  const lines = [
    ...buildTaxGreetingLines(taxName),
    "",
    "いつもお世話になっております。",
    `${data.companyName}の${data.periodLabel}　給与支給一覧をお送りします。(テスト送信・締め前の現時点情報です)`,
    `対象期間: ${data.periodStart.replaceAll("-", "/")}〜${data.periodEnd.replaceAll("-", "/")} / 支給日: ${data.paymentDate.replaceAll("-", "/")}`,
    `詳細は添付の${pdf ? "PDF・CSVファイル" : "CSVファイル"}(支給一覧)をご確認ください。`,
    "",
    buildSignatureLine(data.companyName, managerName),
  ];

  return await sendMail({
    to,
    subject: `【テスト送信】【給与支給一覧】${data.periodLabel}`,
    text: lines.join("\n"),
    attachments: [
      {
        filename: `payroll_${data.periodKey}_test.csv`,
        content: buildCsv(data.rows),
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
