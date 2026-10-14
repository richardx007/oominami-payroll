import { describe, expect, it } from "vitest";
import { countPeopleByGuide, formatSec, playedDelta, summarizeByPerson, watchedPercent, watchedToEnd } from "./guide-views";

describe("playedDelta", () => {
  it("ふつうの再生(0.25秒ずつ)は数える", () => {
    expect(playedDelta(10, 10.25)).toBeCloseTo(0.25);
  });
  it("最初の1回・先送り・巻き戻しは数えない", () => {
    expect(playedDelta(null, 3)).toBe(0);
    expect(playedDelta(10, 40)).toBe(0);
    expect(playedDelta(40, 10)).toBe(0);
    expect(playedDelta(10, Number.NaN)).toBe(0);
  });
});

describe("表示", () => {
  it("秒を分:秒に", () => {
    expect(formatSec(0)).toBe("0:00");
    expect(formatSec(222.97)).toBe("3:43");
  });
  it("割合と最後まで", () => {
    expect(watchedPercent(50, 200)).toBe(25);
    expect(watchedPercent(250, 200)).toBe(100);
    expect(watchedPercent(10, null)).toBeNull();
    expect(watchedToEnd(180, 200)).toBe(true);
    expect(watchedToEnd(179, 200)).toBe(false);
    expect(watchedToEnd(10, null)).toBe(false);
  });
});

describe("summarizeByPerson / countPeopleByGuide", () => {
  const rows = [
    { id: "1", guide_id: "g1", person: "a", name: "たろう", opened_at: "2026-10-14T03:00:00Z", watched_sec: 30, duration_sec: 200 },
    { id: "2", guide_id: "g1", person: "b", name: "はなこ", opened_at: "2026-10-14T04:00:00Z", watched_sec: 200, duration_sec: 200 },
    { id: "3", guide_id: "g1", person: "a", name: "たろう", opened_at: "2026-10-14T05:00:00Z", watched_sec: 120, duration_sec: 200 },
    { id: "4", guide_id: "g2", person: "a", name: "たろう", opened_at: "2026-10-14T06:00:00Z", watched_sec: 0, duration_sec: null },
  ];
  it("人ごとに回数・最後に開いた日時・いちばん長い再生をまとめ、最後に開いた順に並べる", () => {
    const s = summarizeByPerson(rows.slice(0, 3));
    expect(s.map((p) => p.name)).toEqual(["たろう", "はなこ"]);
    expect(s[0]).toMatchObject({ count: 2, last_opened_at: "2026-10-14T05:00:00Z", best_watched_sec: 120, duration_sec: 200 });
  });
  it("解説ごとの人数は同じ人を1人と数える", () => {
    expect(countPeopleByGuide(rows)).toEqual({ g1: 2, g2: 1 });
  });
});
