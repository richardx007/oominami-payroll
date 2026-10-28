import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { AccountSettingsView } from "@/app/account/AccountSettingsView";
import { getMyCalendarFeedUrl } from "@/lib/calendar-feed-url";
import { DeviceLinkSection } from "@/app/account/DeviceLinkSection";
import { PendingDeviceNotice } from "@/app/account/PendingDeviceNotice";
import { LogoutSection } from "@/app/account/LogoutSection";
import { signOut } from "../actions";

/**
 * 管理者用アカウント設定画面。プロフィール編集・この端末での通知登録に加え、
 * 未打刻通知の出勤/退勤スイッチ(旧: admin/settings 画面にあったもの)もここにある。
 */
export default async function AdminAccountPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  // 端末承認制: 管理者は記録だけの期間でも「別の端末を承認する」を出す(自分の端末は自分では承認できず、
  // ホーム画面アプリを作り直したときなどに確認コードで承認するため)。この端末が承認待ちなら案内を出す
  const devicePromise = supabase.rpc("device_my_status");

  const [{ data: profile }, { data: subs }, { data: settings }, calendarFeedUrl, { data: reminder }] = await Promise.all([
    supabase.from("employees").select("furigana").eq("id", me.id).maybeSingle(),
    supabase.from("push_subscriptions").select("endpoint").eq("employee_id", me.id),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "notify_missing_punch_in",
        "notify_missing_punch_out",
        "notify_first_login",
        "notify_business_calendar",
      ]),
    getMyCalendarFeedUrl(),
    supabase
      .from("shift_reminder_settings")
      .select("minutes_before, end_minutes_before")
      .eq("employee_id", me.id)
      .maybeSingle(),
  ]);

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s.value]));

  const { data: device } = await devicePromise;
  const d = device as { approved: boolean; device_status: string | null; enforced: boolean } | null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <h1 className="text-xl font-bold">アカウント設定</h1>
      {d?.device_status === "pending" && <PendingDeviceNotice enforced={d.enforced} />}
      <AccountSettingsView
        name={me.name}
        nickname={me.nickname}
        furigana={profile?.furigana ?? null}
        isAdmin
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        registeredEndpoints={(subs ?? []).map((r) => r.endpoint)}
        shiftReminderMinutes={reminder?.minutes_before ?? null}
        shiftEndReminderMinutes={reminder?.end_minutes_before ?? null}
        calendarFeedUrl={calendarFeedUrl}
        notifyInEnabled={settingsMap.get("notify_missing_punch_in") !== "false"}
        notifyOutEnabled={settingsMap.get("notify_missing_punch_out") !== "false"}
        notifyFirstLoginEnabled={settingsMap.get("notify_first_login") !== "false"}
        notifyBusinessCalendarEnabled={settingsMap.get("notify_business_calendar") !== "false"}
      />
      {d?.approved && <DeviceLinkSection />}
      {/* ログアウトは画面の最下部・右下(メニュー・サイドバーから移設) */}
      <LogoutSection action={signOut} />
    </div>
  );
}
