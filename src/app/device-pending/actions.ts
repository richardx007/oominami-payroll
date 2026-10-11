"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RedeemResult =
  | { result: "approved" }
  | { result: "wrong"; remaining: number }
  | { result: "locked" | "expired" | "not_pending" | "error" };

/** 承認待ちの端末で確認コードを入力する(device_pair_code_redeem) */
export async function redeemPairCode(code: string): Promise<RedeemResult> {
  const parsed = z.string().regex(/^[0-9]{6}$/).safeParse(code);
  if (!parsed.success) return { result: "wrong", remaining: -1 };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("device_pair_code_redeem", { p_code: parsed.data });
  if (error || !data) return { result: "error" };
  return data as RedeemResult;
}

/** 承認されたか(画面が数秒おきに確かめる。管理者が承認したら自動で切り替えるため) */
export async function isDeviceApproved(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("device_my_status");
  const s = data as { approved?: boolean; enforced?: boolean } | null;
  return !!s && (s.approved === true || s.enforced === false);
}

export async function signOutFromPending() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
