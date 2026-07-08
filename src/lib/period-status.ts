// 給与期間のステータス表示(ラベル・バッジ配色)を一元管理する。
// ダッシュボードと締め処理で同じ見た目に揃えるため、両画面からこれを使う。

export type PeriodStatus = "open" | "closed" | "paid" | string;

export function periodStatusLabel(status: PeriodStatus): string {
  return status === "open"
    ? "入力受付中"
    : status === "closed"
      ? "締め済み"
      : "支払済み";
}

/** ステータスバッジの完全なclassName(形・サイズ・配色すべて含む) */
export function periodStatusBadgeClass(status: PeriodStatus): string {
  const color =
    status === "open"
      ? "bg-green-50 text-green-700"
      : status === "closed"
        ? "bg-orange-500 text-white"
        : "bg-gray-100 text-gray-600";
  return `rounded-full px-2.5 py-1 text-xs font-semibold ${color}`;
}
