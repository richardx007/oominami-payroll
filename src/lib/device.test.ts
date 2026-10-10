import { describe, expect, it } from "vitest";
import { deviceLabel, newDeviceToken, sessionIdFromAccessToken } from "./device";

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
