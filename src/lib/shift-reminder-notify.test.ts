import { describe, expect, it } from "vitest";
import { buildShiftReminderMessage } from "./shift-reminder-notify";

describe("シフト通知の文面", () => {
  it("開始の N 分前", () => {
    expect(
      buildShiftReminderMessage({ kind: "start", time: "15:00", date: "9/27", minutes_left: 60 })
    ).toEqual({
      title: "シフト開始の60分前です",
      body: "9/27 15:00 からシフトです。",
      tag: "shift-reminder-start",
      url: "/shifts",
    });
  });

  it("終了の N 分前", () => {
    const m = buildShiftReminderMessage({ kind: "end", time: "23:00", date: "9/27", minutes_left: 10 });
    expect(m.title).toBe("シフト終了の10分前です");
    expect(m.body).toBe("9/27 23:00 終了のシフトです。退勤の打刻をお忘れなく。");
  });

  it("終了時刻ちょうど", () => {
    expect(
      buildShiftReminderMessage({ kind: "end", time: "0:00", date: "9/28", minutes_left: 0 }).title
    ).toBe("シフト終了の時刻です");
  });

  it("マイナス = 終了の N 分後", () => {
    expect(
      buildShiftReminderMessage({ kind: "end", time: "17:00", date: "9/27", minutes_left: -15 }).title
    ).toBe("シフト終了から15分過ぎました");
  });
});
