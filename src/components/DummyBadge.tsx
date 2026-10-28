/**
 * ダミー従業員(テスト用の見えない従業員)の印。ダミーが見えるのはシステム管理者とダミー本人だけ
 * (src/lib/employee-status.ts)。管理画面の一覧で、本物の従業員と見分けるために名前の横に付ける。
 */
export function DummyBadge({ className = "ml-1" }: { className?: string }) {
  return (
    <span className={`rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 ${className}`}>
      ダミー
    </span>
  );
}
