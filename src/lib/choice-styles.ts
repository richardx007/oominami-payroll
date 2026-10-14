/**
 * 選択ボタンと処理ボタンの見分け(2026-10-14 オーナー依頼。経費管理 oominami-business の
 * src/lib/choice-styles.ts と同じ考え方で、色だけ給与管理の青)。
 * 濃い青の塗り(bg-blue-600 + 白文字)は「押すと処理が動くボタン」(保存・追加など)だけに使い、
 * 選択ボタンは塗りつぶさない。選択ボタンは次の2種類:
 *
 * - 案A choiceState: 選択肢が多い・折り返すもの(シフト枠・年の切り替え・絞り込みなど)。
 *   選んだものは明るい青の地+青の枠+太字+右上の ✓ の丸印(色の見分けが苦手でも分かるように)。
 *   ✓ は右上に重ねるのでボタンの幅は変わらない。枠線・文字の太さもここで付けるので、
 *   呼ぶ側は大きさ・余白・角丸だけを付ける。親に overflow-hidden があると ✓ が切れるので注意。
 * - 案B segmentClass / segmentItemClass: 2〜3択の切り替え(在職者/退職者・権限など)。
 *   灰色の溝の中で、選んだものだけ白い札が浮く(iPhone のセグメント)。
 */

/** 案A: 選択ボタンの状態の色(大きさ・余白・角丸は呼ぶ側) */
export function choiceState(selected: boolean): string {
  return selected
    ? "relative border border-blue-600 bg-blue-100 font-bold text-blue-800 ring-1 ring-blue-600 after:absolute after:-right-1.5 after:-top-1.5 after:flex after:h-4 after:w-4 after:items-center after:justify-center after:rounded-full after:bg-blue-600 after:text-[10px] after:font-bold after:leading-none after:text-white after:content-['✓']"
    : "relative border border-gray-300 bg-white font-medium text-gray-700 hover:bg-gray-50";
}

/** 案B: 切り替えの溝(並べ方の flex / grid と幅は呼ぶ側で足す) */
export const segmentClass = "gap-1 rounded-lg bg-gray-200 p-1";

/**
 * 案B: 切り替えの1つ(余白・文字の大きさは呼ぶ側で足す)。
 * selectedText は選んだときの文字色(臨時休業=赤 など意味のある色にしたいとき)
 */
export function segmentItemClass(selected: boolean, selectedText = "text-blue-800"): string {
  return `rounded-md text-center transition ${
    selected ? `bg-white font-bold shadow ring-1 ring-black/5 ${selectedText}` : "font-medium text-gray-600 hover:text-gray-900"
  }`;
}
