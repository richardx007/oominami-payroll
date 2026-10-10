import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { todayJST } from "@/lib/period";
import { loadAllWithholdingSlips, loadIssuerInfo } from "@/lib/my-documents";
import { WithholdingSlipButton } from "@/components/WithholdingSlipButton";

/**
 * 源泉徴収票(管理者)。在職・退職を問わず、年ごとに従業員の源泉徴収票を出す。
 * 退職者はログインできず自分で出せないため、ここから出して渡す(退職後1か月以内の交付義務)。
 * 住所・生年月日はオーナーにはそのまま、システム管理者には伏せ字で出る(employee_profiles_for_admin)。
 */
export default async function WithholdingPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const today = todayJST();
  const { y } = await searchParams;
  const year = Number(y) || Number(today.slice(0, 4));

  const { employer } = await loadIssuerInfo(supabase);
  const { years, rows } = await loadAllWithholdingSlips(supabase, year, employer, today);
  const yearList = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">源泉徴収票</h1>
        <p className="mt-1 text-sm text-gray-500">
          その年に給与を支払った従業員の源泉徴収票です。退職した人はログインできないので、ここから出して渡してください(退職後1か月以内)。
        </p>
        {!me.is_owner && (
          <p className="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600">
            システム管理者には、従業員の住所・生年月日は伏せ字(＊)で表示されます。
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {yearList.map((yy) => (
          <Link
            key={yy}
            href={`/admin/withholding?y=${yy}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              yy === year
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {yy}年分
          </Link>
        ))}
      </div>

      {!employer.address && (
        <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          支払者の所在地が未設定です。
          <Link href="/admin/settings" className="font-medium underline">
            設定
          </Link>
          の「源泉徴収票(支払者)」で入力してください。
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{year}年に支払った給与はありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">氏名</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2 text-right">支払金額</th>
                <th className="px-3 py-2 text-right">源泉徴収税額</th>
                <th className="px-3 py-2">住所・生年月日</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{r.employeeNo}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.name}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.status === "active" ? "在職" : <span className="text-orange-700">退職</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    ¥{r.slip.totals.paymentTotal.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    ¥{r.slip.totals.taxTotal.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.slip.address && r.slip.birthDate ? (
                      <span className="text-green-700">入力済み</span>
                    ) : (
                      <span className="text-red-600">未入力あり</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <WithholdingSlipButton
                      data={r.slip}
                      label={r.slip.inProgressAsOf ? "PDF(途中経過)" : "PDF"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
