import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  EmailSettingsForm,
  LunchAllowanceForm,
  TaxTableForm,
  type TaxTableRow,
} from "./ui";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: allowances }, { data: taxYears }, { data: settings }] =
    await Promise.all([
      supabase
        .from("allowance_settings")
        .select("lunch_allowance_per_day, effective_from")
        .order("effective_from", { ascending: false })
        .limit(5),
      supabase
        .from("withholding_tax_table")
        .select(
          "year, min_amount, max_amount, tax_otsu, tax_kou_0, tax_kou_1, tax_kou_2, tax_kou_3, tax_kou_4, tax_kou_5, tax_kou_6, tax_kou_7, created_at"
        )
        .order("year", { ascending: false })
        .order("min_amount", { ascending: true }),
      supabase.from("app_settings").select("key, value"),
    ]);

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s.value]));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">設定</h1>
          <p className="mt-1 text-sm text-gray-500">
            メール送信や手当などの共通設定を行います
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">
          ver.{process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev"}
        </span>
      </div>
      <EmailSettingsForm
        companyName={settingsMap.get("company_name") ?? ""}
        gmailUser={settingsMap.get("gmail_user") ?? ""}
        taxName={settingsMap.get("tax_accountant_name") ?? ""}
        taxEmail={settingsMap.get("tax_accountant_email") ?? ""}
      />
      <LunchAllowanceForm history={allowances ?? []} />
      <TaxTableForm rows={(taxYears ?? []) as TaxTableRow[]} />
    </div>
  );
}
