// 画面遷移中の即時フィードバック(空白防止・連打防止)。
export default function EmployeeLoading() {
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
