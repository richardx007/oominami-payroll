import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { EmailSettingsForm, LunchAllowanceForm, TaxTableForm } from "./ui";

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
      supabase.from("withholding_tax_table").select("year"),
      supabase.from("app_settings").select("key, value"),
    ]);

  const yearCounts = new Map<number, number>();
  for (const r of taxYears ?? []) {
    yearCounts.set(r.year, (yearCounts.get(r.year) ?? 0) + 1);
  }

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s.value]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          メール送信や手当などの共通設定を行います
        </p>
      </div>
      <EmailSettingsForm
        companyName={settingsMap.get("company_name") ?? ""}
        gmailUser={settingsMap.get("gmail_user") ?? ""}
        taxEmail={settingsMap.get("tax_accountant_email") ?? ""}
      />
      <LunchAllowanceForm history={allowances ?? []} />
      <TaxTableForm
        years={[...yearCounts.entries()].sort((a, b) => b[0] - a[0])}
      />
    </div>
  );
}
