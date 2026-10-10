import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { DevicesView, type DeviceRow } from "./ui";

/**
 * 端末(端末承認制)。どの人がどの端末から使っているかの一覧と、承認待ちの承認・取り消し。
 * 仕組みは supabase/migrations/20261010120000_trusted_devices.sql・設計書§21 を参照。
 */
export default async function DevicesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: mode }] = await Promise.all([
    supabase.rpc("device_list"),
    supabase.from("app_settings").select("value").eq("key", "device_enforcement").maybeSingle(),
  ]);
  const enforcing = mode?.value === "enforce";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">端末</h1>
        <p className="mt-1 text-sm text-gray-500">
          従業員がログインしている端末の一覧です。新しい端末からログインがあると「承認待ち」になります。
          心当たりのある端末だけ承認してください。自分の端末は、もう1人の管理者が承認します。
        </p>
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            enforcing ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-800"
          }`}
        >
          {enforcing
            ? "現在: 承認されていない端末からはデータを見られません。"
            : "現在: 記録だけの期間です。承認待ちの端末からも今まで通り使えます(ブロックはまだしていません)。"}
        </p>
      </div>
      <DevicesView devices={(data ?? []) as DeviceRow[]} />
    </div>
  );
}
