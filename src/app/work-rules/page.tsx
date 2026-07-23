import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 勤務ルール文書を表示する共有ページ(従業員・管理者どちらのハンバーガーメニューからも遷移)。
 * app_settings は管理者のみ SELECT 可のため、メタ情報は get_work_rules_meta() 経由で取得する。
 * 文書は非公開ストレージ(work-rules バケット)に置き、署名付きURLへリダイレクトして表示する
 * (画像/PDFともブラウザが直接レンダリングするので専用ビューアは用意しない)。
 */
export default async function WorkRulesPage() {
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
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-lg font-bold text-gray-700">勤務ルール</p>
        <p className="mt-2 text-sm text-gray-500">
          まだ勤務ルールの文書は登録されていません。管理者にご確認ください。
        </p>
      </main>
    );
  }

  const { data: signed } = await supabase.storage
    .from("work-rules")
    .createSignedUrl(path, 60);

  if (!signed?.signedUrl) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-lg font-bold text-gray-700">勤務ルール</p>
        <p className="mt-2 text-sm text-gray-500">
          文書の表示に失敗しました。時間をおいて再度お試しください。
        </p>
      </main>
    );
  }

  redirect(signed.signedUrl);
}
