/**
 * 日本の祝日を取得する。
 * データ元: holidays-jp（https://holidays-jp.github.io/）— APIキー不要の静的JSON。
 * 取得失敗時は空を返す（祝日色付けが無効になるだけで、機能は動作する）。
 */
export async function fetchJapaneseHolidays(
  years: number[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    years.map(async (y) => {
      try {
        const res = await fetch(
          `https://holidays-jp.github.io/api/v1/${y}/date.json`,
          { next: { revalidate: 60 * 60 * 24 } } // 1日キャッシュ
        );
        if (res.ok) {
          const data = (await res.json()) as Record<string, string>;
          Object.assign(result, data);
        }
      } catch {
        // 取得失敗は無視
      }
    })
  );
  return result;
}
