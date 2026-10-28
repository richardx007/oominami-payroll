import Link from "next/link";

/**
 * この端末が承認待ちのときにアカウント設定の上に出す案内(端末承認制)。
 * 記録だけの期間(ブロックしていない間)は承認待ちの画面に移されないため、ここから確認コードの入力へ案内する
 * (ホーム画面アプリを作り直したときなど。承認すると管理者への承認依頼も片付く)。
 */
export function PendingDeviceNotice({ enforced }: { enforced: boolean }) {
  return (
    <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-800">この端末は承認待ちです</h2>
      <p className="text-sm text-amber-800">
        {enforced
          ? "承認されるまで、この端末ではデータを見られません。"
          : "今は承認しなくても使えますが、いつも使っている端末で出した確認コードを入れると、この端末をすぐ承認できます。"}
      </p>
      <Link
        href="/device-pending"
        className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        確認コードで承認する
      </Link>
    </section>
  );
}
