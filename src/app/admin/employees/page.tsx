import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { EmployeeList } from "./ui";

export type EmployeeRow = {
  id: string;
  employee_no: string;
  name: string;
  furigana: string | null;
  nickname: string | null;
  email: string;
  is_admin: boolean;
  is_leader: boolean;
  status: string;
  auth_user_id: string | null;
  invited_at: string | null;
  color: string | null;
  wage_rates: { hourly_wage: number; effective_from: string }[];
  lunch_allowance_rates: { lunch_allowance: number; effective_from: string }[];
  tax_settings: {
    tax_category: string;
    dependents: number;
    effective_from: string;
  }[];
  /** 個人情報(源泉徴収票用)。オーナーにはそのまま、システム管理者には伏せ字で届く。未入力は null */
  profile: { postal_code: string; address: string; phone: string; birth_date: string } | null;
};

export default async function EmployeesPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  // 個人情報はテーブルを直接読まず、伏せ字の判定込みの関数から取る(オーナー以外は伏せ字)
  const { data: profiles } = await supabase.rpc("employee_profiles_for_admin");
  const profileOf = new Map(
    ((profiles ?? []) as (EmployeeRow["profile"] & { employee_id: string })[]).map((p) => [p.employee_id, p])
  );

  const { data: employees } = await supabase
    .from("employees")
    .select(
      `id, employee_no, name, furigana, nickname, email, is_admin, is_leader, status, auth_user_id, invited_at, color,
       wage_rates ( hourly_wage, effective_from ),
       lunch_allowance_rates ( lunch_allowance, effective_from ),
       tax_settings ( tax_category, dependents, effective_from )`
    )
    .order("employee_no");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-bold">従業員管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          従業員の登録・時給・税区分の設定を行います
        </p>
      </div>
      <EmployeeList
        employees={(employees ?? []).map((e) => ({ ...e, profile: profileOf.get(e.id) ?? null })) as EmployeeRow[]}
        isOwner={me.is_owner}
      />
    </div>
  );
}
