// 画面遷移中に即座に表示されるローディング。サーバーでのデータ取得を待つ間、
// 空白のままにせずスピナーを出すことで「タップが効いていない」誤解と連打を防ぐ。
export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#152449]"
        role="status"
        aria-label="読み込み中"
      />
    </div>
  );
}
