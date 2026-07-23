import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClockConfirm } from "./ui";

export default async function ClockPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const employee = await requireEmployee();
  const { type } = await searchParams;
  const clockType: "in" | "out" = type === "out" ? "out" : "in";

  const supabase = await createClient();
  // app_settings は管理者のみ SELECT 可のため、関数経由で取得する
  const [{ data }, { data: contactRows }] = await Promise.all([
    supabase.rpc("get_clock_settings"), // clock_* 設定
    supabase.rpc("get_contact_settings"), // 会社名・送信元メール(圏外時の管理者メール用)
  ]);
  const s = new Map(
    ((data ?? []) as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ])
  );
  const contact = new Map(
    ((contactRows ?? []) as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ])
  );
  const hasBase =
    Number.isFinite(parseFloat(s.get("clock_base_lat") ?? "")) &&
    Number.isFinite(parseFloat(s.get("clock_base_lng") ?? "")) &&
    parseInt(s.get("clock_radius_m") ?? "", 10) > 0;
  const roundMin = parseInt(s.get("clock_round_min") ?? "", 10) || 0;

  // 直近の交通費入力(区間・金額・往復/片道・手段)をデフォルト表示に使う
  const { data: recent } = await supabase
    .from("work_entries")
    .select("transport_mode, station_from, station_to, round_trip, transport_cost")
    .eq("employee_id", employee.id)
    .gt("transport_cost", 0)
    .not("station_from", "is", null)
    .order("work_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const transportDefault = recent
    ? {
        mode: recent.transport_mode ?? "",
        from: recent.station_from ?? "",
        to: recent.station_to ?? "",
        roundTrip: recent.round_trip ?? true,
        cost: recent.transport_cost ?? 0,
      }
    : null;

  return (
    <ClockConfirm
      employeeName={employee.name}
      type={clockType}
      locationEnabled={hasBase}
      roundMin={roundMin}
      transportDefault={transportDefault}
      adminEmail={contact.get("gmail_user") ?? ""}
      companyName={contact.get("company_name") ?? ""}
    />
  );
}
