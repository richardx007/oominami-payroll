import { describe, expect, it } from "vitest";
import { buildShiftChangeMessage } from "./shift-change-notify";

describe("シフト変更通知の文面", () => {
  it("1日の変更", () => {
    expect(
      buildShiftChangeMessage({
        changes: [{ date: "10/5", before: "早番", after: "遅番(16:00〜)" }],
        actors: ["たろう"],
      })
    ).toEqual({
      title: "確定シフトが変更されました",
      body: "10/5 早番 → 遅番(16:00〜)\n（変更: たろう）",
      tag: "shift-change",
      url: "/shifts",
    });
  });

  it("複数の変更者は・でつなぐ", () => {
    const m = buildShiftChangeMessage({
      changes: [
        { date: "10/5", before: "なし", after: "早番" },
        { date: "10/7", before: "深夜", after: "なし" },
      ],
      actors: ["たろう", "管理者"],
    });
    expect(m.body).toBe("10/5 なし → 早番\n10/7 深夜 → なし\n（変更: たろう・管理者）");
  });

  it("6日以上はほかN日にまとめる", () => {
    const changes = Array.from({ length: 7 }, (_, i) => ({
      date: `10/${i + 1}`,
      before: "早番",
      after: "遅番",
    }));
    const lines = buildShiftChangeMessage({ changes, actors: [] }).body.split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe("ほか2日");
  });
});
