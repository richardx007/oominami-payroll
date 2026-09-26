import { describe, expect, it } from "vitest";
import { readMp4CreationTime } from "./mp4-meta";

const MAC_EPOCH_S = Date.UTC(1904, 0, 1) / 1000;

function box(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** mvhd（version 0/1）に作成日時を入れた最小の MP4 もどき */
function mp4(date: Date | 0, version: 0 | 1 = 0, moovFirst = true): Blob {
  const secs = date === 0 ? 0 : Math.floor(date.getTime() / 1000) - MAC_EPOCH_S;
  const body = new Uint8Array(version === 1 ? 32 : 20);
  const dv = new DataView(body.buffer);
  dv.setUint8(0, version);
  if (version === 1) dv.setBigUint64(4, BigInt(secs));
  else dv.setUint32(4, secs);
  const moov = box("moov", concat(box("mvhd", body), box("trak", new Uint8Array(16))));
  const ftyp = box("ftyp", new Uint8Array(12));
  const mdat = box("mdat", new Uint8Array(64));
  const parts = moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov];
  return new Blob(parts.map((p) => p.slice().buffer));
}

describe("readMp4CreationTime（動画に記録された作成日時）", () => {
  const d = new Date("2026-09-26T06:21:00Z");

  it("mvhd version 0 の作成日時を読む", async () => {
    expect((await readMp4CreationTime(mp4(d)))?.toISOString()).toBe(d.toISOString());
  });
  it("mvhd version 1（64ビット）も読む", async () => {
    expect((await readMp4CreationTime(mp4(d, 1)))?.toISOString()).toBe(d.toISOString());
  });
  it("moov がファイルの後ろにあっても読む", async () => {
    expect((await readMp4CreationTime(mp4(d, 0, false)))?.toISOString()).toBe(d.toISOString());
  });
  it("記録がない（0）なら null（呼び出し側で更新日時に切り替える）", async () => {
    expect(await readMp4CreationTime(mp4(0))).toBeNull();
  });
  it("MP4 でないファイルは null", async () => {
    expect(await readMp4CreationTime(new Blob([new Uint8Array([1, 2, 3])]))).toBeNull();
  });
});
