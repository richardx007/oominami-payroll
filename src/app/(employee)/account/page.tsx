import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { AccountSettingsView } from "@/app/account/AccountSettingsView";

/** 従業員用アカウント設定画面。プロフィール編集と、この端末での通知登録ができる。 */
export default async function EmployeeAccountPage() {
  const me = await requireEmployee();
  const supabase = await createClient();

  const [{ data: profile }, { data: subs }] = await Promise.all([
    supabase.from("employees").select("furigana").eq("id", me.id).maybeSingle(),
    supabase.from("push_subscriptions").select("endpoint").eq("employee_id", me.id),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">アカウント設定</h1>
      <AccountSettingsView
        name={me.name}
        nickname={me.nickname}
        furigana={profile?.furigana ?? null}
        isAdmin={false}
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        registeredEndpoints={(subs ?? []).map((r) => r.endpoint)}
      />
    </div>
  );
}
