import { z } from "zod";

const emailSchema = z.email();

/**
 * カンマ区切りのメールアドレス(税理士の宛先など)を1件ずつに分ける。
 * 全角のカンマ・読点・セミコロン・改行・空白も区切りとして受け付け、空の要素と重複は除く。
 */
export function splitEmailList(value: string | null | undefined): string[] {
  const list = (value ?? "")
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(list)];
}

/** splitEmailList の各要素を検証する。形式が正しくないアドレスがあれば invalid に入れて返す */
export function parseEmailList(value: string | null | undefined): {
  emails: string[];
  invalid: string[];
} {
  const emails = splitEmailList(value);
  return {
    emails,
    invalid: emails.filter((e) => !emailSchema.safeParse(e).success),
  };
}
