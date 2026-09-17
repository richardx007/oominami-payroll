import { describe, expect, it } from "vitest";
import { buildPdfFromJpeg } from "./poster-export";

// 最小の JPEG 風バイト列（SOI … EOI）。PDF の構造（xref のオフセット・Length）を確かめる用
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 1, 2, 3, 4, 0xff, 0xd9]);

describe("ポスターPDFの組み立て", () => {
  it("xref の各オフセットが N 0 obj を指し、画像の Length が実バイト数と一致する", async () => {
    const blob = buildPdfFromJpeg(JPEG, 10, 14);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);

    expect(blob.type).toBe("application/pdf");
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(text.match(/startxref\n(\d+)\n/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((off, i) => expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));

    expect(text).toContain(`/Length ${JPEG.length}>>`);
    const streamStart = text.indexOf("stream\n", text.indexOf("4 0 obj")) + "stream\n".length;
    expect([...bytes.slice(streamStart, streamStart + JPEG.length)]).toEqual([...JPEG]);
  });
});
