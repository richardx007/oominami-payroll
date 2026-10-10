import { z } from "zod";

/**
 * 源泉徴収票に載せる個人情報(住所・電話番号・生年月日)の入力チェック。
 * 本人の設定画面(account/actions.ts)とオーナーの従業員画面(admin/employees/actions.ts)で共用する。
 */
export const personalInfoSchema = z.object({
  postal_code: z
    .string()
    .trim()
    .regex(/^(\d{3}-?\d{4})?$/, "郵便番号は 123-4567 の形で入力してください"),
  address: z.string().trim().max(200, "住所が長すぎます"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-() ]{0,20}$/, "電話番号は数字とハイフンで入力してください"),
  birth_date: z.union([z.literal(""), z.iso.date("生年月日の形式が正しくありません")]),
});

/** フォームの値をチェックし、employee_profiles に保存する形にする */
export function parsePersonalInfo(
  formData: FormData
):
  | { ok: true; value: { postal_code: string; address: string; phone: string; birth_date: string | null } }
  | { ok: false; message: string } {
  const parsed = personalInfoSchema.safeParse({
    postal_code: formData.get("postal_code") ?? "",
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    birth_date: formData.get("birth_date") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.birth_date && (d.birth_date < "1900-01-01" || d.birth_date > new Date().toISOString().slice(0, 10))) {
    return { ok: false, message: "生年月日を確認してください" };
  }
  return {
    ok: true,
    value: {
      // 郵便番号はハイフン付きにそろえる
      postal_code: d.postal_code.replace(/^(\d{3})-?(\d{4})$/, "$1-$2"),
      address: d.address,
      phone: d.phone,
      birth_date: d.birth_date || null,
    },
  };
}
