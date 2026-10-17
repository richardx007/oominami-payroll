import { describe, expect, it } from "vitest";
import { formatJstDate, formatJstDateTime, formatJstDateWeekday, jstYmd } from "./jst-format";

describe("jst-format", () => {
  // UTC 15:30 は日本時間の翌日 0:30(日付の変わり目)
  const iso = "2026-07-14T15:30:00.000Z";
  const tz = { timeZone: "Asia/Tokyo" } as const;

  it("毎回 toLocaleString で作った文字列と同じになる", () => {
    const d = new Date(iso);
    expect(formatJstDateTime(iso)).toBe(
      d.toLocaleString("ja-JP", { ...tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    );
    expect(formatJstDate(iso)).toBe(
      d.toLocaleDateString("ja-JP", { ...tz, year: "numeric", month: "2-digit", day: "2-digit" })
    );
    expect(formatJstDateWeekday(iso)).toBe(
      d.toLocaleDateString("ja-JP", { ...tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    );
  });

  it("日本時間の暦日で返す", () => {
    expect(formatJstDateTime(iso)).toBe("2026/07/15 00:30");
    expect(formatJstDate(iso)).toBe("2026/07/15");
    expect(formatJstDateWeekday(iso)).toBe("2026/07/15(水)");
    expect(jstYmd(iso)).toBe("2026-07-15");
    expect(jstYmd(new Date(iso))).toBe("2026-07-15");
  });
});
