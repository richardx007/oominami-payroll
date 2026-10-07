import { describe, expect, it } from "vitest";
import { groupReimbursements, itemDate } from "./expense-reimbursement";

describe("groupReimbursements", () => {
  it("立替者ごとに合計し、内訳は並びのまま", () => {
    const m = groupReimbursements([
      { advanced_by: "a", purchased_on: "2026-09-18", vendor: "コーナン", description: "ゴミ袋", amount: 2160 },
      { advanced_by: "b", purchased_on: "2026-09-20", vendor: "ダイソー", description: "洗剤", amount: 330 },
      { advanced_by: "a", purchased_on: "2026-09-23", vendor: "ダイソー", description: "スポンジ", amount: 1080 },
    ]);
    expect(m.get("a")?.total).toBe(3240);
    expect(m.get("a")?.items.map((i) => i.vendor)).toEqual(["コーナン", "ダイソー"]);
    expect(m.get("b")?.total).toBe(330);
    expect(groupReimbursements([]).size).toBe(0);
  });
  it("内訳の日付は M/D", () => {
    expect(itemDate("2026-09-08")).toBe("9/8");
  });
});
