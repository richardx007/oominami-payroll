import { describe, expect, it } from "vitest";
import {
  defaultShiftMode,
  previousDate,
  scheduleWindow,
  shiftModeLabel,
  todayNicknameStyle,
} from "./shifts";

describe("シフトの既定モード", () => {
  // shift_modes に行が無い月の既定。
  // ※DB側の is_shift_draft() が同じ規則を持つ。**片方だけ変えないこと。**
  it("翌月度以降は調整中、今月度以前は確定", () => {
    expect(defaultShiftMode("2026-09", "2026-08")).toBe("draft");
    expect(defaultShiftMode("2026-08", "2026-08")).toBe("confirmed");
    expect(defaultShiftMode("2026-07", "2026-08")).toBe("confirmed");
  });

  it("年をまたいでも文字列比較で正しく判定できる", () => {
    expect(defaultShiftMode("2027-01", "2026-12")).toBe("draft");
    expect(defaultShiftMode("2026-12", "2027-01")).toBe("confirmed");
  });

  it("表示名", () => {
    expect(shiftModeLabel("draft")).toBe("調整中");
    expect(shiftModeLabel("confirmed")).toBe("確定");
  });
});

describe("scheduleWindow", () => {
  it("同日内の枠(早番 8:00-17:00)", () => {
    const { startAt, endAt } = scheduleWindow("2026-08-10", "8:00", "17:00");
    expect(startAt.toISOString()).toBe("2026-08-09T23:00:00.000Z"); // JST 8:00
    expect(endAt.toISOString()).toBe("2026-08-10T08:00:00.000Z"); // JST 17:00
  });

  it("日をまたぐ枠(遅番 15:00-0:00)", () => {
    const { startAt, endAt } = scheduleWindow("2026-08-10", "15:00", "0:00");
    expect(startAt.toISOString()).toBe("2026-08-10T06:00:00.000Z"); // JST 15:00
    expect(endAt.toISOString()).toBe("2026-08-10T15:00:00.000Z"); // 翌日 JST 0:00
  });

  it("開始が0〜5時台の枠(深夜 0:00-9:00)は開始を翌日扱いにする", () => {
    const { startAt, endAt } = scheduleWindow("2026-08-10", "0:00", "9:00");
    expect(startAt.toISOString()).toBe("2026-08-10T15:00:00.000Z"); // 翌日 JST 0:00
    expect(endAt.toISOString()).toBe("2026-08-11T00:00:00.000Z"); // 翌日 JST 9:00
  });
});

describe("todayNicknameStyle", () => {
  const workDate = "2026-08-10";
  const { startAt, endAt } = scheduleWindow(workDate, "8:00", "17:00");

  it("その日にシフト予定が無ければ null", () => {
    expect(
      todayNicknameStyle(
        { plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null },
        workDate,
        Date.now()
      )
    ).toBeNull();
  });

  it("出勤予定前・未打刻はnormal", () => {
    const times = {
      plannedStart: "8:00",
      plannedEnd: "17:00",
      actualStart: null,
      actualEnd: null,
    };
    expect(
      todayNicknameStyle(times, workDate, startAt.getTime() - 60_000)
    ).toBe("normal");
  });

  it("出勤予定時刻を過ぎても未打刻はmismatch(赤太字)", () => {
    const times = {
      plannedStart: "8:00",
      plannedEnd: "17:00",
      actualStart: null,
      actualEnd: null,
    };
    expect(todayNicknameStyle(times, workDate, startAt.getTime())).toBe(
      "mismatch"
    );
  });

  it("出勤済み・退勤予定+30分以内で未打刻はmatch(黒太字)", () => {
    const times = {
      plannedStart: "8:00",
      plannedEnd: "17:00",
      actualStart: "8:00",
      actualEnd: null,
    };
    expect(
      todayNicknameStyle(times, workDate, endAt.getTime() + 29 * 60_000)
    ).toBe("match");
  });

  it("退勤予定を30分以上過ぎても未打刻はoverdue(赤細字)", () => {
    const times = {
      plannedStart: "8:00",
      plannedEnd: "17:00",
      actualStart: "8:00",
      actualEnd: null,
    };
    expect(
      todayNicknameStyle(times, workDate, endAt.getTime() + 31 * 60_000)
    ).toBe("overdue");
  });

  it("出退勤とも打刻済みならnull(呼び出し側でnicknameStyle(status)にフォールバック)", () => {
    const times = {
      plannedStart: "8:00",
      plannedEnd: "17:00",
      actualStart: "8:00",
      actualEnd: "17:00",
    };
    expect(todayNicknameStyle(times, workDate, endAt.getTime())).toBeNull();
  });

  it("退勤予定時刻を過ぎてなお出勤の打刻すら無い場合はnormalに戻す(過去の欠勤扱い)", () => {
    const times = {
      plannedStart: "8:00",
      plannedEnd: "17:00",
      actualStart: null,
      actualEnd: null,
    };
    expect(
      todayNicknameStyle(times, workDate, endAt.getTime() + 60_000)
    ).toBe("normal");
  });

  it("日をまたぐ深夜勤務(業務日付は前日)でも進行中ならmatch", () => {
    // けーやんの実例(2026-08-15調査): shift_assignments.work_date=8/14, slot C(0:00-9:00)。
    // businessDateOf の規則により深夜番の業務日付は前日のまま。実際の壁時計では8/15 00:00に開始、
    // 未退勤のまま8/15の朝を迎えても「進行中(match)」であるべき(赤字太字にならないこと)。
    const nightWorkDate = "2026-08-14";
    const { endAt: nightEndAt } = scheduleWindow(nightWorkDate, "0:00", "9:00");
    const times = {
      plannedStart: "0:00",
      plannedEnd: "9:00",
      actualStart: "00:00",
      actualEnd: null,
    };
    // 8/15 08:18相当(退勤予定9:00より前)
    const nowMs = nightEndAt.getTime() - 42 * 60_000;
    expect(todayNicknameStyle(times, nightWorkDate, nowMs)).toBe("match");
  });
});

describe("previousDate", () => {
  it("前日の日付文字列を返す", () => {
    expect(previousDate("2026-08-15")).toBe("2026-08-14");
    expect(previousDate("2026-09-01")).toBe("2026-08-31");
    expect(previousDate("2027-01-01")).toBe("2026-12-31");
  });
});
