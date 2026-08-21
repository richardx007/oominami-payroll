import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { TaxTableForm, type TaxTableRow } from "./ui";

/**
 * 源泉徴収税額表(月額表)の管理。以前は設定画面の1項目だったが、頻度・重要度が高いため
 * 独立したメニュー項目にした(2026-08-22、オーナー依頼)。
 */
export default async function TaxTablePage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: taxYears } = await supabase
    .from("withholding_tax_table")
    .select(
      "year, min_amount, max_amount, tax_otsu, tax_kou_0, tax_kou_1, tax_kou_2, tax_kou_3, tax_kou_4, tax_kou_5, tax_kou_6, tax_kou_7, created_at"
    )
    .order("year", { ascending: false })
    .order("min_amount", { ascending: true });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">税額表</h1>
        <p className="mt-1 text-sm text-gray-500">
          源泉徴収税額表(月額表)を年度ごとに登録します
        </p>
      </div>
      <TaxTableForm rows={(taxYears ?? []) as TaxTableRow[]} />
    </div>
  );
}
