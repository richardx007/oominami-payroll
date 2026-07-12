import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { EmployeeList } from "./ui";

export type EmployeeRow = {
  id: string;
  employee_no: string;
  name: string;
  email: string;
  is_admin: boolean;
  status: string;
  auth_user_id: string | null;
  invited_at: string | null;
  wage_rates: { hourly_wage: number; effective_from: string }[];
  tax_settings: {
    tax_category: string;
    dependents: number;
    effective_from: string;
  }[];
};

export default async function EmployeesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: employees } = await supabase
    .from("employees")
    .select(
      `id, employee_no, name, email, is_admin, status, auth_user_id, invited_at,
       wage_rates ( hourly_wage, effective_from ),
       tax_settings ( tax_category, dependents, effective_from )`
    )
    .order("employee_no");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">従業員管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          従業員の登録・時給・税区分の設定を行います
        </p>
      </div>
      <EmployeeList employees={(employees ?? []) as EmployeeRow[]} />
    </div>
  );
}
