"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import type { ActionResult } from "../employees/actions";

const idSchema = z.uuid();

/** 承認待ちの端末を承認する(自分の端末は不可。DB関数 device_approve が判定) */
export async function approveDevice(id: string, summary: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "端末の指定が不正です" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("device_approve", { p_id: id });
  if (error) return { ok: false, message: error.message };
  await logActivity("端末", `承認: ${summary}`);
  revalidatePath("/admin/devices");
  return { ok: true, message: "承認しました" };
}

/** 端末を取り消す(以後、その端末からのログインは承認待ち扱い) */
export async function revokeDevice(id: string, summary: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "端末の指定が不正です" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("device_revoke", { p_id: id });
  if (error) return { ok: false, message: error.message };
  await logActivity("端末", `取り消し: ${summary}`);
  revalidatePath("/admin/devices");
  return { ok: true, message: "取り消しました" };
}
