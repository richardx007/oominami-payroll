"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "../../employees/actions";

/** 管理メニュー「ホームページ」の「ホームページを表示」で開く URL(app_settings.homepage_url)を保存する */
export async function updateHomepageUrl(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const raw = String(formData.get("homepage_url") ?? "").trim();
  if (raw !== "") {
    let ok = false;
    try {
      const u = new URL(raw);
      ok = u.protocol === "https:" || u.protocol === "http:";
    } catch {
      ok = false;
    }
    if (!ok) return { ok: false, message: "https:// から始まる URL を入力してください" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "homepage_url", value: raw }, { onConflict: "key" });
  if (error) return { ok: false, message: "保存に失敗しました" };
  revalidatePath("/admin/calendar/preview");
  return { ok: true, message: "ホームページの URL を保存しました" };
}
