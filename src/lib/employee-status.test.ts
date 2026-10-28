import { describe, expect, it } from "vitest";
import { isDummyStatus, isWorkingStatus } from "./employee-status";

describe("isWorkingStatus", () => {
  it("在職とダミーは在職と同じに扱う", () => {
    expect(isWorkingStatus("active")).toBe(true);
    expect(isWorkingStatus("dummy")).toBe(true);
    expect(isWorkingStatus("retired")).toBe(false);
    expect(isWorkingStatus(null)).toBe(false);
  });
  it("ダミーの判定", () => {
    expect(isDummyStatus("dummy")).toBe(true);
    expect(isDummyStatus("active")).toBe(false);
  });
});
