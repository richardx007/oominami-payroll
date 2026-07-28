import { describe, expect, it } from "vitest";
import { defaultShiftMode, shiftModeLabel } from "./shifts";

describe("シフトの既定モード", () => {
  // shift_modes に行が無い月の既定。
  // ※DB側の is_shift_draft() が同じ規則を持つ。**片方だけ変えないこと。**
  it("翌月度以降は調整中、今月度以前は確定", () => {
    expect(defaultShiftMode("2026-09", "2026-08")).toBe("draft");
    expect(defaultShiftMode("2026-08", "2026-08")).toBe("confirmed");
    expect(defaultShiftMode("2026-07", "2026-08")).toBe("confirmed");
  });

  it("年をまたいでも文字列比較で正しく判定できる", () => {
    expect(defaultShiftMode("2027-01", "2026-12")).toBe("draft");
    expect(defaultShiftMode("2026-12", "2027-01")).toBe("confirmed");
  });

  it("表示名", () => {
    expect(shiftModeLabel("draft")).toBe("調整中");
    expect(shiftModeLabel("confirmed")).toBe("確定");
  });
});
