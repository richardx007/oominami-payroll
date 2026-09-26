/**
 * MP4/MOV の作成日時を読む（アプリの解説の動画登録で使う）。
 *
 * ブラウザの File からはファイルの「作成日時」そのものは取れない（lastModified は更新日時）ため、
 * 動画の中の moov > mvhd ボックスの creation_time（1904-01-01 00:00 UTC からの秒数）を読む。
 * iPhone・カメラで撮った動画には入っている。ffmpeg で書き出した動画は `-metadata creation_time=...` を
 * 付けないと 0 になるので、その場合は null を返す（呼び出し側で更新日時に切り替える）。
 *
 * ファイル全体は読まず、ボックスの見出しと mvhd の先頭だけを slice で読む（数十MBの動画でも軽い）。
 */

type Sliceable = { size: number; slice(start: number, end: number): Blob };

const MAC_EPOCH_MS = Date.UTC(1904, 0, 1);
// 1904年起点の 0 や壊れた値を弾くための範囲
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);

async function view(file: Sliceable, start: number, len: number): Promise<DataView> {
  return new DataView(await file.slice(start, Math.min(file.size, start + len)).arrayBuffer());
}

/** start から end までのボックスを順に見て、type のボックスの [本体の開始, 終了] を返す */
async function findBox(file: Sliceable, start: number, end: number, type: string): Promise<[number, number] | null> {
  let pos = start;
  for (let n = 0; n < 1000 && pos + 8 <= end; n++) {
    const h = await view(file, pos, 16);
    if (h.byteLength < 8) return null;
    let size = h.getUint32(0);
    const name = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    let header = 8;
    if (size === 1) {
      if (h.byteLength < 16) return null;
      size = Number(h.getBigUint64(8));
      header = 16;
    } else if (size === 0) {
      size = end - pos; // ファイルの最後まで
    }
    if (size < header) return null;
    if (name === type) return [pos + header, Math.min(end, pos + size)];
    pos += size;
  }
  return null;
}

/** 動画に記録された作成日時。読めない・記録がない（0）・ありえない値なら null */
export async function readMp4CreationTime(file: Sliceable): Promise<Date | null> {
  try {
    const moov = await findBox(file, 0, file.size, "moov");
    if (!moov) return null;
    const mvhd = await findBox(file, moov[0], moov[1], "mvhd");
    if (!mvhd) return null;
    const v = await view(file, mvhd[0], 12);
    const version = v.getUint8(0);
    const secs = version === 1 ? Number(v.getBigUint64(4)) : v.getUint32(4);
    const ms = MAC_EPOCH_MS + secs * 1000;
    return ms >= MIN_MS && ms < MAX_MS ? new Date(ms) : null;
  } catch {
    return null;
  }
}
