import { describe, expect, it } from "vitest";
import { buildBusinessCalendarMessage } from "./business-calendar-notify";

describe("営業カレンダーの自動作成通知", () => {
  it("作成: 11月分は9月30日まで、10月1日から公開", () => {
    expect(buildBusinessCalendarMessage("created", "2026-11")).toEqual({
      title: "11月の営業カレンダーを作成しました",
      body: "9月30日までに、臨時休業・営業時間の変更・イベントを設定してください。10月1日からホームページに表示されます。",
      tag: "business-calendar-2026-11",
      url: "/admin/calendar?ym=2026-11",
    });
  });

  it("年をまたぐ: 1月分は11月30日まで、12月1日から公開", () => {
    expect(buildBusinessCalendarMessage("created", "2027-01").body).toBe(
      "11月30日までに、臨時休業・営業時間の変更・イベントを設定してください。12月1日からホームページに表示されます。"
    );
  });

  it("失敗: 祝日データなし", () => {
    const m = buildBusinessCalendarMessage("failed", "2027-12");
    expect(m.title).toBe("営業カレンダーを作成できませんでした");
    expect(m.body).toContain("12月分の自動作成を中止しました");
    expect(m.url).toBe("/admin/calendar?ym=2027-12");
  });
});
