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
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["clock_base_lat", "clock_base_lng", "clock_radius_m"]);
  const s = new Map((data ?? []).map((r) => [r.key, r.value]));
  const hasBase =
    Number.isFinite(parseFloat(s.get("clock_base_lat") ?? "")) &&
    Number.isFinite(parseFloat(s.get("clock_base_lng") ?? "")) &&
    parseInt(s.get("clock_radius_m") ?? "", 10) > 0;

  return (
    <ClockConfirm
      employeeName={employee.name}
      type={clockType}
      locationEnabled={hasBase}
    />
  );
}
