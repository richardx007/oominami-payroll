import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

/**
 * 勤務ルール(管理者)。2026-10-12 のメニュー整理で、メニュー「勤務ルール」は表示画面(/work-rules)を
 * 直接開くのをやめ、設定画面にあった「勤務ルール」欄をここへ移した(オーナー依頼)。
 * 表示方法は「営業と勤務時間」から作った画面に固定し、文書のアップロードは廃止したので、
 * 設定項目は無く、作られ方の説明と「勤務ルールの表示」ボタンだけを置く。
 * 従業員のメニュー・シフト表からは従来どおり /work-rules を直接開く。
 */
export default async function AdminWorkRulesPage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">勤務ルール</h1>
        <p className="mt-1 text-sm text-gray-500">
          従業員・管理者ともメニューの「勤務ルール」からいつでも確認できます
        </p>
      </div>
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">勤務ルールの内容</h2>
        <p className="mt-2 text-sm text-gray-700">
          勤務ルールは、
          <Link href="/admin/calendar/patterns" className="text-blue-700 hover:underline">
            「営業と勤務時間」
          </Link>
          で設定したシフト枠・休憩時間から自動で作られます。各番の勤務時間・休憩時間（基準）・深夜勤務時間を、
          今日有効な定義で表示します（先の適用開始日の定義があれば、表示画面の上部で切り替えて見られます）。
        </p>
        <p className="mt-2 text-sm text-gray-500">
          内容を変えるときは「営業と勤務時間」でシフト枠・休憩時間を変更してください。表示画面の「PDF」から A4 の PDF にできます。
        </p>
      </section>
      <Link
        href="/work-rules"
        className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        勤務ルールの表示
      </Link>
    </div>
  );
}
