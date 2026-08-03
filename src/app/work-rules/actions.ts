"use server";

import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 勤務ルール画像の署名付きURLを返す。
 * PC サイドバーの「勤務ルール」はページ遷移せず同ページ上のモーダルで表示するため、
 * クライアントから呼べるサーバーアクションとして切り出している。
 * (/work-rules ページ自体は従来どおりモバイル用に残す)
 */
export async function getWorkRulesUrl(): Promise<
  { url: string } | { error: string }
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
