import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { AccountSettingsView } from "@/app/account/AccountSettingsView";
import { getMyCalendarFeedUrl } from "@/lib/calendar-feed-url";
import { DeviceLinkSection } from "@/app/account/DeviceLinkSection";
import { PendingDeviceNotice } from "@/app/account/PendingDeviceNotice";
import { LogoutSection } from "@/app/account/LogoutSection";
import { signOut } from "../actions";

/** 従業員用アカウント設定画面。プロフィール編集と、この端末での通知登録ができる。 */
export default async function EmployeeAccountPage() {
  const me = await requireEmployee();
  const supabase = await createClient();
  // 端末承認制でブロックの対象の人だけ「別の端末を承認する」を出す(試験運用中は対象者だけ)。
  // この端末が承認待ちなら、記録だけの期間でも確認コードの入力へ案内する
  const devicePromise = supabase.rpc("device_my_status");

  const [{ data: profile }, { data: subs }, calendarFeedUrl, { data: reminder }, { data: personal }] = await Promise.all([
    supabase.from("employees").select("furigana").eq("id", me.id).maybeSingle(),
    supabase.from("push_subscriptions").select("endpoint").eq("employee_id", me.id),
    getMyCalendarFeedUrl(),
    supabase
      .from("shift_reminder_settings")
      .select("minutes_before, end_minutes_before, shift_change")
      .eq("employee_id", me.id)
      .maybeSingle(),
    // 源泉徴収票に載せる住所・電話番号・生年月日(employees とは別テーブル)
    supabase
      .from("employee_profiles")
      .select("postal_code, address, phone, birth_date")
      .eq("employee_id", me.id)
      .maybeSingle(),
  ]);

  const { data: device } = await devicePromise;
  const d = device as { approved: boolean; device_status: string | null; enforced: boolean } | null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">アカウント設定</h1>
      {d?.device_status === "pending" && <PendingDeviceNotice enforced={d.enforced} />}
      <AccountSettingsView
        name={me.name}
        nickname={me.nickname}
        furigana={profile?.furigana ?? null}
        isAdmin={false}
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        registeredEndpoints={(subs ?? []).map((r) => r.endpoint)}
        shiftReminderMinutes={reminder?.minutes_before ?? null}
        shiftEndReminderMinutes={reminder?.end_minutes_before ?? null}
        // 行が無い・未設定(null)は既定のオン
        shiftChangeEnabled={reminder?.shift_change ?? true}
        calendarFeedUrl={calendarFeedUrl}
        personalInfo={{
          postalCode: personal?.postal_code ?? "",
          address: personal?.address ?? "",
          phone: personal?.phone ?? "",
          birthDate: personal?.birth_date ?? "",
        }}
      />
      {d?.enforced && <DeviceLinkSection />}
      {/* ログアウトは画面の最下部・右下(メニュー・サイドバーから移設) */}
      <LogoutSection action={signOut} />
    </div>
  );
}
