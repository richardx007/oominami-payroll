import { describe, expect, it } from "vitest";
import { formatJstDateTime, isoToJstInput, jstInputToIso } from "./app-guides";

describe("動画ファイルの作成日時（日本時間の入力欄 ⇔ ISO）", () => {
  it("日本時間の入力値を ISO(UTC) にする", () => {
    expect(jstInputToIso("2026-09-26T15:20")).toBe("2026-09-26T06:20:00.000Z");
    expect(jstInputToIso("2026-10-01T00:30")).toBe("2026-09-30T15:30:00.000Z");
  });
  it("空・不正な値は null", () => {
    expect(jstInputToIso("")).toBeNull();
    expect(jstInputToIso("2026/09/26 15:20")).toBeNull();
  });
  it("ISO を日本時間の入力値に戻す（往復で一致）", () => {
    expect(isoToJstInput("2026-09-30T15:30:00.000Z")).toBe("2026-10-01T00:30");
    expect(isoToJstInput(jstInputToIso("2026-12-31T23:59"))).toBe("2026-12-31T23:59");
    expect(isoToJstInput(null)).toBe("");
  });
  it("一覧の表示は日本時間", () => {
    expect(formatJstDateTime("2026-09-26T06:20:00.000Z")).toBe("2026/9/26 15:20");
  });
});
