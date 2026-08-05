import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { AccountSettingsView } from "@/app/account/AccountSettingsView";

/**
 * 管理者用アカウント設定画面。プロフィール編集・この端末での通知登録に加え、
 * 未打刻通知の出勤/退勤スイッチ(旧: admin/settings 画面にあったもの)もここにある。
 */
export default async function AdminAccountPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const [{ data: profile }, { data: subs }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("furigana").eq("id", me.id).maybeSingle(),
    supabase.from("push_subscriptions").select("endpoint").eq("employee_id", me.id),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["notify_missing_punch_in", "notify_missing_punch_out"]),
  ]);

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s.value]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <h1 className="text-xl font-bold">アカウント設定</h1>
      <AccountSettingsView
        name={me.name}
        nickname={me.nickname}
        furigana={profile?.furigana ?? null}
        isAdmin
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        registeredEndpoints={(subs ?? []).map((r) => r.endpoint)}
        notifyInEnabled={settingsMap.get("notify_missing_punch_in") !== "false"}
        notifyOutEnabled={settingsMap.get("notify_missing_punch_out") !== "false"}
      />
    </div>
  );
}
