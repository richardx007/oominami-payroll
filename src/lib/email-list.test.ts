import { describe, expect, it } from "vitest";
import { parseEmailList, splitEmailList } from "./email-list";

describe("splitEmailList", () => {
  it("カンマ区切りを1件ずつに分ける", () => {
    expect(splitEmailList("a@example.com, b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("全角カンマ・読点・改行・空白も区切りにし、空と重複は除く", () => {
    expect(
      splitEmailList(" a@example.com，b@example.com、\nc@example.com  a@example.com,,")
    ).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
  });

  it("未設定は空の配列", () => {
    expect(splitEmailList("")).toEqual([]);
    expect(splitEmailList(null)).toEqual([]);
  });
});

describe("parseEmailList", () => {
  it("形式が正しくないアドレスを invalid に返す", () => {
    expect(parseEmailList("a@example.com, b@example, c")).toEqual({
      emails: ["a@example.com", "b@example", "c"],
      invalid: ["b@example", "c"],
    });
  });
});
