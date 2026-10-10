import { SEAL_ALLOWED_TYPES, SEAL_MAX_SIZE } from "@/lib/payslip-issuer";

/**
 * 印の画像を、保存できる大きさ(SEAL_MAX_SIZE 以下の png/jpg)にブラウザ側で縮小する。
 *
 * スキャンや写真から作った印の画像は 150KB を超えることが多い。以前は超えるとサーバーで
 * エラーにしていたが、そのときフォームのファイル選択が外れ、もう一度「保存する」を押すと
 * **印なしで「保存しました」と出る**ため、印が保存できていないことに気づけなかった
 * (2026-10-10 に本番で発生)。PDFに印字する印は 18mm でも撮影時 200px 程度なので、
 * 一辺 SEAL_MAX_PX まで縮めても見た目は変わらない。
 *
 * - すでに上限以下の png/jpg はそのまま返す。
 * - それ以外(大きい・webp/gif など)は canvas で描き直す。png は透明部分を保つため png のまま、
 *   jpg は jpg(品質0.9)で出す。上限を超える間は一辺を 3/4 ずつ縮める。
 * - ブラウザが読めない画像(Chrome での HEIC など)は Error を投げる。
 */
const SEAL_MAX_PX = 600;
const SEAL_MIN_PX = 150;

export async function shrinkSealImage(file: File): Promise<File> {
  if (SEAL_ALLOWED_TYPES.includes(file.type) && file.size <= SEAL_MAX_SIZE) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "この画像は読み込めません。png か jpg で保存し直してから選んでください"
    );
  }

  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const ext = type === "image/jpeg" ? "jpg" : "png";
  const baseName = file.name.replace(/\.[^.]*$/, "") || "seal";

  try {
    let side = Math.min(SEAL_MAX_PX, Math.max(bitmap.width, bitmap.height));
    for (;;) {
      const scale = side / Math.max(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("画像の縮小に失敗しました");
      if (type === "image/jpeg") {
        // jpg は透明を持てないので白で下地を塗る
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, 0.9)
      );
      if (!blob) throw new Error("画像の縮小に失敗しました");
      if (blob.size <= SEAL_MAX_SIZE) {
        return new File([blob], `${baseName}.${ext}`, { type });
      }
      if (side <= SEAL_MIN_PX) {
        throw new Error(
          "印の画像を150KB以下に縮小できませんでした。余白を切り取った画像で試してください"
        );
      }
      side = Math.max(SEAL_MIN_PX, Math.floor(side * 0.75));
    }
  } finally {
    bitmap.close();
  }
}
