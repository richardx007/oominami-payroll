import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseTaxTableExcel } from "./tax-table-excel";

/**
 * 国税庁の月額表Excelの構造を模した最小のワークブックを作る。
 * 実物(令和8年分)で検証済みの構造を再現している:
 *   見出し行 → 「(最小額)円未満」の文言だけの変則行 → 空行 → 数値の帯が並ぶ(間に空行あり)
 *   → 未満が空欄の最終帯(乙欄は数値) → それ以降は税率の計算式(文言)
 */
function buildWorkbook(rows: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "月額表");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const sampleRows: (string | number)[][] = [
  ["", "給与所得の源泉徴収税額表（令和８年分）"],
  ["", "月　額　表"],
  ["", "その月の社会保", "", "甲"],
  ["", "険料等控除後の", "", "扶養親族等の数"],
  ["", "給与等の金額", "", "0人", "1人", "2人", "3人", "4人", "5人", "6人", "7人", "", "乙"],
  ["", "以上", "未満", "税額", "", "", "", "", "", "", "", "税額"],
  ["", "円", "円", "円", "円", "円", "円", "円", "円", "円", "円", "円"],
  [
    "",
    "105,000",
    "円未満",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "その月の社会保険料等控除後の給与等の金額の3.063％に相当する金額",
  ],
  [],
  ["1", "105,000", "107,000", "170", "0", "0", "0", "0", "0", "0", "0", "3,800"],
  [],
  ["2", "107,000", "109,000", "280", "0", "0", "0", "0", "0", "0", "0", "3,800"],
  [],
  ["", "109,000", "", "300", "0", "0", "0", "0", "0", "0", "0", "4,000"],
  [],
  ["", "109,000円を超え", "", "109,000円の場合の税額に、給与等の金額のうち…"],
  ["", "", "", "3,500,000円を超える金額の45.945％に相当する金額を加算した金額"],
];

describe("parseTaxTableExcel", () => {
  it("見出し・変則行・空行・高額所得者向け計算式部分を除いて帯データだけを抽出する", () => {
    const result = parseTaxTableExcel(buildWorkbook(sampleRows));

    expect(result.year).toBe(2026); // 令和8年 = 2018+8
    expect(result.count).toBe(3);
    expect(result.minAmount).toBe(105000);
    expect(result.maxAmount).toBe(109000);
    expect(result.csv).toBe(
      [
        "105000,107000,170,0,0,0,0,0,0,0,3800",
        "107000,109000,280,0,0,0,0,0,0,0,3800",
        "109000,,300,0,0,0,0,0,0,0,4000",
      ].join("\n")
    );
  });

  it("データ行が1件も無ければエラーを投げる", () => {
    const headerOnly = sampleRows.slice(0, 7);
    expect(() => parseTaxTableExcel(buildWorkbook(headerOnly))).toThrow();
  });
});
