import { describe, it, expect } from "vitest";
import { parseUserAgent, formatClientInfo } from "./client-info";

describe("User-Agent の判定", () => {
  it("iPhone Safari", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({ device: "iPhone", os: "iOS 18.5", browser: "Safari 18" });
  });

  it("iPhone Chrome(CriOS)は Chrome と判定する", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1"
    );
    expect(r.device).toBe("iPhone");
    expect(r.browser).toBe("Chrome 130");
  });

  it("Android Chrome", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
      )
    ).toEqual({ device: "Android", os: "Android 15", browser: "Chrome 130" });
  });

  it("Androidタブレットは Mobile が無いことで見分ける", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
      ).device
    ).toBe("Androidタブレット");
  });

  it("Windows Edge は Chrome ではなく Edge と判定する", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
      )
    ).toEqual({ device: "PC", os: "Windows", browser: "Edge 130" });
  });

  it("Windows Chrome", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      ).browser
    ).toBe("Chrome 131");
  });

  it("Mac Safari", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15"
      )
    ).toEqual({ device: "Mac", os: "macOS", browser: "Safari 17" });
  });

  it("不明な UA でも落ちない", () => {
    expect(parseUserAgent("")).toEqual({
      device: "不明",
      os: "不明",
      browser: "不明",
    });
  });

  it("ログ用の1行に整形する", () => {
    expect(
      formatClientInfo({
        mode: "PWA",
        device: "iPhone",
        os: "iOS 18.5",
        browser: "Safari 18",
      })
    ).toBe("PWA / iPhone / iOS 18.5 / Safari 18");
  });
});
