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
  // app_settings は管理者のみ SELECT 可のため、clock_* だけ返す関数で取得する
  const { data } = await supabase.rpc("get_clock_settings");
  const s = new Map(
    ((data ?? []) as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ])
  );
  const hasBase =
    Number.isFinite(parseFloat(s.get("clock_base_lat") ?? "")) &&
    Number.isFinite(parseFloat(s.get("clock_base_lng") ?? "")) &&
    parseInt(s.get("clock_radius_m") ?? "", 10) > 0;
  const roundMin = parseInt(s.get("clock_round_min") ?? "", 10) || 0;

  return (
    <ClockConfirm
      employeeName={employee.name}
      type={clockType}
      locationEnabled={hasBase}
      roundMin={roundMin}
    />
  );
}
