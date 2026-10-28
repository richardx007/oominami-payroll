import { describe, expect, it } from "vitest";
import {
  deviceLabel,
  isDeviceGateExempt,
  isHandoffToken,
  newDeviceToken,
  sessionIdFromAccessToken,
} from "./device";

function jwt(payload: object) {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "ES256" })}.${b64(payload)}.sig`;
}

describe("newDeviceToken", () => {
  it("43文字の base64url で毎回違う", () => {
    const a = newDeviceToken();
    const b = newDeviceToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("sessionIdFromAccessToken", () => {
  it("session_id を取り出す", () => {
    expect(sessionIdFromAccessToken(jwt({ sub: "u", session_id: "abc-123" }))).toBe("abc-123");
  });
  it("無い・壊れている場合は null", () => {
    expect(sessionIdFromAccessToken(undefined)).toBeNull();
    expect(sessionIdFromAccessToken("not-a-jwt")).toBeNull();
    expect(sessionIdFromAccessToken("a.!!!.c")).toBeNull();
    expect(sessionIdFromAccessToken(jwt({ sub: "u" }))).toBeNull();
  });
});

describe("deviceLabel", () => {
  it("UA から 端末 / OS / ブラウザ", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(ua)).toBe("iPhone / iOS 18.5 / Safari 18");
    expect(deviceLabel(null)).toBe("不明 / 不明 / 不明");
  });
});

describe("canIssueDeviceToken", () => {
  it("画面の読み込み(document)か、ヘッダーが無いときだけ", async () => {
    const { canIssueDeviceToken } = await import("./device");
    expect(canIssueDeviceToken("document")).toBe(true);
    expect(canIssueDeviceToken(null)).toBe(true);
    expect(canIssueDeviceToken("empty")).toBe(false);
  });
});

describe("deviceLabel(iPad)", () => {
  it("Mac を名乗るタッチ画面は iPad", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    expect(deviceLabel(ua, true)).toBe("iPad / iPadOS / Safari 26");
    expect(deviceLabel(ua, false)).toBe("Mac / macOS / Safari 26");
  });
});

describe("isHandoffToken", () => {
  it("48文字の16進だけ通す", () => {
    expect(isHandoffToken("a".repeat(48))).toBe(true);
    expect(isHandoffToken("0123456789abcdef".repeat(3))).toBe(true);
    expect(isHandoffToken("A".repeat(48))).toBe(false);
    expect(isHandoffToken("a".repeat(47))).toBe(false);
    expect(isHandoffToken(null)).toBe(false);
  });
});

describe("isDeviceGateExempt", () => {
  it("承認待ちの画面・ログイン・公開ページは通す", () => {
    expect(isDeviceGateExempt("/device-pending")).toBe(true);
    expect(isDeviceGateExempt("/login")).toBe(true);
    expect(isDeviceGateExempt("/auth/confirm")).toBe(true);
    expect(isDeviceGateExempt("/api/notify/new-device")).toBe(true);
  });
  it("それ以外の画面は通さない(似た名前も)", () => {
    expect(isDeviceGateExempt("/timesheet")).toBe(false);
    expect(isDeviceGateExempt("/admin")).toBe(false);
    expect(isDeviceGateExempt("/loginx")).toBe(false);
    expect(isDeviceGateExempt("/")).toBe(false);
  });
});

describe("deviceLabel(ホーム画面アプリ)", () => {
  it("standalone なら末尾に アプリ", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(ua, false, true)).toBe("iPhone / iOS 18.7 / Safari 27 / アプリ");
  });
});

describe("splitDeviceLabel", () => {
  it("iOS 26 以降は Safari の版で OS を読み替える", async () => {
    const { splitDeviceLabel } = await import("./device");
    expect(splitDeviceLabel("iPhone / iOS 18.7 / Safari 27")).toEqual({ device: "iPhone", os: "iOS 27", app: "Safari 27" });
    expect(splitDeviceLabel("iPad / iPadOS / Safari 26 / アプリ")).toEqual({ device: "iPad", os: "iPadOS 26", app: "アプリ" });
    expect(splitDeviceLabel("iPhone / iOS 18.5 / Safari 18").os).toBe("iOS 18.5");
  });
  it("端末名を短くする", async () => {
    const { splitDeviceLabel } = await import("./device");
    expect(splitDeviceLabel("PC / Windows / Edge 140")).toEqual({ device: "Win", os: "Windows", app: "Edge 140" });
    expect(splitDeviceLabel("Androidタブレット / Android 15 / Chrome 155").device).toBe("Android");
    expect(splitDeviceLabel("Mac / macOS / Chrome 155")).toEqual({ device: "Mac", os: "macOS", app: "Chrome 155" });
    expect(splitDeviceLabel("")).toEqual({ device: "不明", os: "不明", app: "不明" });
  });
});
