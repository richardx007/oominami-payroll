import { describe, expect, it } from "vitest";
import { parseClockQr } from "./clock-qr";

const origin = "https://oominami-payroll.example.com";

describe("parseClockQr", () => {
  it("出勤・退勤のQRを判定する", () => {
    expect(parseClockQr(`${origin}/clock?type=in`, origin)).toBe("in");
    expect(parseClockQr(`${origin}/clock?type=out`, origin)).toBe("out");
  });
  it("別サイト・別パス・不正な種別・URLでない文字列は null", () => {
    expect(parseClockQr("https://evil.example.com/clock?type=in", origin)).toBeNull();
    expect(parseClockQr(`${origin}/timesheet?type=in`, origin)).toBeNull();
    expect(parseClockQr(`${origin}/clock?type=x`, origin)).toBeNull();
    expect(parseClockQr(`${origin}/clock`, origin)).toBeNull();
    expect(parseClockQr("hello", origin)).toBeNull();
  });
});
