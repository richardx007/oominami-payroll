import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { EmailSettingsForm, EmployerInfoForm, PayslipIssuerForm } from "./ui";
import { TaxTableForm, type TaxTableRow } from "./tax-table";
import { parsePayslipIssuer } from "@/lib/payslip-issuer";
import { adjacentPeriodKey, currentPeriod, periodFromKey } from "@/lib/period";
import { periodStatusLabel } from "@/lib/period-status";

/** テスト送信で選べる月度の数(当月度から過去へ) */
const TEST_PERIOD_COUNT = 12;

/**
 * 設定。2026-10-12 にメニュー整理(オーナー依頼)で次のように組み替えた。
 * - テスト送信 → メール設定の枠の一番下
 * - イベントの種類と色 → 営業カレンダー画面のカレンダーの下
 * - シフト予定表・勤務表ロック・QR打刻の位置設定 → 「営業と勤務時間」画面の下部
 * - 勤務ルール → 表示方法を「営業と勤務時間から作った画面」に固定し、文書のアップロードは廃止
 * - 税額表(独立メニューだった /admin/tax-table) → この画面の一番下
 */
export default async function SettingsPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [{ data: settings }, { data: taxYears }, { data: payPeriods }] =
    await Promise.all([
      supabase.from("app_settings").select("key, value"),
      supabase
        .from("withholding_tax_table")
        .select(
          "year, min_amount, max_amount, tax_otsu, tax_kou_0, tax_kou_1, tax_kou_2, tax_kou_3, tax_kou_4, tax_kou_5, tax_kou_6, tax_kou_7, created_at"
        )
        .order("year", { ascending: false })
        .order("min_amount", { ascending: true }),
      supabase.from("pay_periods").select("start_date, status"),
    ]);

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const issuer = parsePayslipIssuer(settings ?? []);

  // テスト送信の月度(当月度から過去へ)。入力受付中/締め済み/支払済みも名前に付ける
  const statusByStart = new Map(
    (payPeriods ?? []).map((p) => [p.start_date, p.status])
  );
  const testPeriods = [];
  for (let key = currentPeriod().key; testPeriods.length < TEST_PERIOD_COUNT; ) {
    const period = periodFromKey(key)!;
    const status = statusByStart.get(period.start) ?? "open";
    testPeriods.push({
      key,
      label: `${period.label}(${periodStatusLabel(status)})`,
    });
    key = adjacentPeriodKey(key, -1);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">設定</h1>
          <p className="mt-1 text-sm text-gray-500">
            メール送信や給与明細・源泉徴収票・税額表などの共通設定を行います
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">
          ver.{process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev"}
        </span>
      </div>
      <EmailSettingsForm
        companyName={settingsMap.get("company_name") ?? ""}
        managerName={settingsMap.get("manager_name") ?? ""}
        gmailUser={settingsMap.get("gmail_user") ?? ""}
        taxName={settingsMap.get("tax_accountant_name") ?? ""}
        taxEmail={settingsMap.get("tax_accountant_email") ?? ""}
        testSendTo={admin.email}
        testPeriods={testPeriods}
      />
      <PayslipIssuerForm issuer={issuer} />
      <EmployerInfoForm
        name={settingsMap.get("employer_name") ?? ""}
        address={settingsMap.get("employer_address") ?? ""}
        phone={settingsMap.get("employer_phone") ?? ""}
        companyName={settingsMap.get("company_name") ?? ""}
      />
      <TaxTableForm rows={(taxYears ?? []) as TaxTableRow[]} />
    </div>
  );
}
