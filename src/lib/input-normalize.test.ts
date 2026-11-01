import { describe, expect, it } from "vitest";
import { normalizeTimeText, parseTimeText, sanitizeNumeric, sanitizeTime, toHalfWidthNumeric } from "./input-normalize";

describe("toHalfWidthNumeric / sanitizeNumeric", () => {
  it("かなモードの全角数字・記号を半角にする", () => {
    expect(toHalfWidthNumeric("１２３４")).toBe("1234");
    expect(toHalfWidthNumeric("９：００")).toBe("9:00");
    expect(toHalfWidthNumeric("１。５")).toBe("1.5");
    expect(toHalfWidthNumeric("ー１０")).toBe("-10");
  });
  it("数字以外は落とす(指定したときだけマイナス・小数点・ハイフンを残す)", () => {
    expect(sanitizeNumeric("１，０００円")).toBe("1000");
    expect(sanitizeNumeric("-10")).toBe("10");
    expect(sanitizeNumeric("ー１０", { negative: true })).toBe("-10");
    expect(sanitizeNumeric("１．５", { decimal: true })).toBe("1.5");
    expect(sanitizeNumeric("１２３ー４５６７", { hyphen: true })).toBe("123-4567");
    expect(sanitizeNumeric("123 456")).toBe("123456");
  });
  it("時刻欄は数字と : だけ残す", () => {
    expect(sanitizeTime("９：３０")).toBe("9:30");
    expect(sanitizeTime("9時30")).toBe("930");
  });
});

describe("parseTimeText / normalizeTimeText", () => {
  it(": なしの数字を時刻として読む", () => {
    expect(normalizeTimeText("900")).toBe("9:00");
    expect(normalizeTimeText("2300")).toBe("23:00");
    expect(normalizeTimeText("1530")).toBe("15:30");
    expect(normalizeTimeText("0")).toBe("0:00");
    expect(normalizeTimeText("9")).toBe("9:00");
    expect(normalizeTimeText("23")).toBe("23:00");
    expect(normalizeTimeText("０９００")).toBe("9:00");
    expect(normalizeTimeText("９：３０")).toBe("9:30");
  });
  it("pad で時を2桁にする", () => {
    expect(normalizeTimeText("900", { pad: true })).toBe("09:00");
    expect(normalizeTimeText("9:00", { pad: true })).toBe("09:00");
    expect(normalizeTimeText("", { pad: true })).toBe("");
  });
  it("読めない値はそのまま返す", () => {
    expect(normalizeTimeText("960")).toBe("960");
    expect(normalizeTimeText("2400")).toBe("2400");
    expect(normalizeTimeText("12345")).toBe("12345");
    expect(parseTimeText("9:5")).toBeNull();
  });
  it("最大を広げると翌日の時刻(26:00)や 24:00 も読む", () => {
    expect(parseTimeText("2600")).toBeNull();
    expect(parseTimeText("2600", 47 * 60 + 59)).toBe(26 * 60);
    expect(parseTimeText("24:00", 24 * 60)).toBe(1440);
    expect(parseTimeText("2401", 24 * 60)).toBeNull();
  });
});
