import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DevicePendingView } from "./ui";

export const metadata = { title: "端末の承認 | 給与管理システム" };

type MyStatus = {
  approved: boolean;
  device_status: "pending" | "approved" | "revoked" | null;
  label: string | null;
  enforced: boolean;
  name: string;
};

/**
 * 承認待ちの画面(端末承認制)。ブロックの対象の人が、承認されていない端末で開くと middleware がここへ移す。
 * 確認コード(承認済みの端末で出す6桁)を入れるか、管理者の承認を待つ。承認されたら自動で切り替わる。
 */
export default async function DevicePendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("device_my_status");
  const s = data as MyStatus | null;
  // 承認済み・ブロック対象でない人はここに用が無い
  if (!s || s.approved || !s.enforced) redirect("/");

  return (
    <DevicePendingView
      name={s.name}
      label={s.label ?? ""}
      revoked={s.device_status === "revoked"}
    />
  );
}
