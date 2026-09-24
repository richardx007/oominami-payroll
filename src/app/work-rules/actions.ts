"use server";

import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 勤務ルールの表示先を返す(組み立て画面なら /work-rules、画像なら署名付きURL)。
 * PC サイドバーの「勤務ルール」はページ遷移せず同ページ上のモーダルで表示するため、
 * クライアントから呼べるサーバーアクションとして切り出している。
 * (/work-rules ページ自体は従来どおりモバイル用に残す)
 */
export async function getWorkRulesUrl(): Promise<
  { url: string; page?: boolean } | { error: string }
> {
  await requireEmployee(); // ログイン確認(管理者・従業員どちらも可)
  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("get_work_rules_meta");
  const meta = new Map(
    ((rows ?? []) as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ])
  );
  // 「営業と勤務時間」から組み立てる画面(既定)は、モーダル内に /work-rules をそのまま埋め込む
  if (meta.get("work_rules_mode") !== "image") {
    return { url: "/work-rules?embed=1", page: true };
  }
  const path = meta.get("work_rules_path");
  if (!path) {
    return { error: "まだ勤務ルールの文書は登録されていません。" };
  }

  const { data: signed } = await supabase.storage
    .from("work-rules")
    .createSignedUrl(path, 300);
  if (!signed?.signedUrl) {
    return { error: "文書の表示に失敗しました。時間をおいて再度お試しください。" };
  }
  return { url: signed.signedUrl };
}
