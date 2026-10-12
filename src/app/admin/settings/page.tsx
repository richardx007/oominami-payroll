import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { EmailSettingsForm, EmployerInfoForm, PayslipIssuerForm } from "./ui";
import { TaxTableForm, type TaxTableRow } from "./tax-table";
import { parsePayslipIssuer } from "@/lib/payslip-issuer";

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

  const [{ data: settings }, { data: taxYears }] = await Promise.all([
    supabase.from("app_settings").select("key, value"),
    supabase
      .from("withholding_tax_table")
      .select(
        "year, min_amount, max_amount, tax_otsu, tax_kou_0, tax_kou_1, tax_kou_2, tax_kou_3, tax_kou_4, tax_kou_5, tax_kou_6, tax_kou_7, created_at"
      )
      .order("year", { ascending: false })
      .order("min_amount", { ascending: true }),
  ]);

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const issuer = parsePayslipIssuer(settings ?? []);

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
