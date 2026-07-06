import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { LunchAllowanceForm } from "./ui";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: allowances } = await supabase
    .from("allowance_settings")
    .select("lunch_allowance_per_day, effective_from")
    .order("effective_from", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          手当などの共通設定を行います
        </p>
      </div>
      <LunchAllowanceForm history={allowances ?? []} />
    </div>
  );
}
