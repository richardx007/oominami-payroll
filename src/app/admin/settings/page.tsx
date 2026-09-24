import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  EmailSettingsForm,
  PayslipIssuerForm,
  ShiftMonthStartForm,
  TestSendForm,
  TimesheetLockForm,
  WorkRulesForm,
} from "./ui";
import { ClockSettingsForm } from "./clock";
import { EventTypesForm } from "./event-types";
import type { EventTypeRow } from "@/lib/business-calendar-view";
import { parsePayslipIssuer } from "@/lib/payslip-issuer";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("key, value");

  const { data: eventTypes } = await supabase
    .from("calendar_event_types")
    .select("id, name, color, sort_order, is_default")
    .order("sort_order");

  const settingsMap = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const issuer = parsePayslipIssuer(settings ?? []);

  // 勤務ルール文書のプレビュー用署名付きURL(登録済みの場合のみ)
  const workRulesPath = settingsMap.get("work_rules_path");
  const workRulesPreviewUrl = workRulesPath
    ? (
        await supabase.storage.from("work-rules").createSignedUrl(workRulesPath, 300)
      ).data?.signedUrl ?? null
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">設定</h1>
          <p className="mt-1 text-sm text-gray-500">
            メール送信や打刻・シフトなどの共通設定を行います
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">
          ver.{process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev"}
        </span>
      </div>
      <EmailSettingsForm
        companyName={settingsMap.get("company_name") ?? ""}
        managerName={settingsMap.get("manager_name") ?? ""}
        gmailUser={settingsMap.get("gmail_user") ?? ""}
        taxName={settingsMap.get("tax_accountant_name") ?? ""}
        taxEmail={settingsMap.get("tax_accountant_email") ?? ""}
      />
      <TestSendForm defaultEmail={admin.email} />
      <PayslipIssuerForm issuer={issuer} />
      <ShiftMonthStartForm
        monthStart={settingsMap.get("shift_month_start") === "1"}
      />
      <TimesheetLockForm
        locked={settingsMap.get("lock_employee_time_edit") === "true"}
      />
      <ClockSettingsForm
        companyName={settingsMap.get("company_name") ?? ""}
        lat={settingsMap.get("clock_base_lat") ?? ""}
        lng={settingsMap.get("clock_base_lng") ?? ""}
        radiusM={settingsMap.get("clock_radius_m") ?? ""}
        policy={settingsMap.get("clock_out_of_range") ?? "warn"}
        roundMin={settingsMap.get("clock_round_min") ?? "0"}
      />
      <EventTypesForm types={(eventTypes ?? []) as EventTypeRow[]} />
      <WorkRulesForm
        mode={settingsMap.get("work_rules_mode") === "image" ? "image" : "generated"}
        currentFilename={settingsMap.get("work_rules_filename") ?? null}
        previewUrl={workRulesPreviewUrl}
      />
    </div>
  );
}
