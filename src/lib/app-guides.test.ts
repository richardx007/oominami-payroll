import { describe, expect, it } from "vitest";
import { formatJstDateTime } from "./app-guides";

describe("formatJstDateTime（一覧の作成日時・更新日時の表示）", () => {
  it("日本時間で表示する", () => {
    expect(formatJstDateTime("2026-09-26T06:20:00.000Z")).toBe("2026/9/26 15:20");
    expect(formatJstDateTime("2026-09-30T15:30:00.000Z")).toBe("2026/10/1 00:30");
  });
});
