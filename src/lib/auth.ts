import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Employee = {
  id: string;
  employee_no: string;
  name: string;
  email: string;
  is_admin: boolean;
  status: string;
};

/** ログイン中の従業員を取得。未連携なら連携を試みる。未ログインは /login へ */
export async function requireEmployee(): Promise<Employee> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let { data: employee } = await supabase
    .from("employees")
    .select("id, employee_no, name, email, is_admin, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!employee) {
    // メール確認直後などで未連携の場合に紐付けを試みる
    const { data: linked } = await supabase.rpc("link_employee_account");
    if (linked) {
      ({ data: employee } = await supabase
        .from("employees")
        .select("id, employee_no, name, email, is_admin, status")
        .eq("auth_user_id", user.id)
        .maybeSingle());
    }
  }

  if (!employee) redirect("/login?error=no_employee");
  return employee;
}

export async function requireAdmin(): Promise<Employee> {
  const employee = await requireEmployee();
  if (!employee.is_admin) redirect("/timesheet");
  return employee;
}
