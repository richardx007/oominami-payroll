import { z } from "zod";
import { standardBreakMinutes } from "@/lib/period";

/**
 * 勤務記録の入力スキーマ(従業員・管理者で共用)。
 * サーバーアクション("use server")からは関数しか export できないため、
 * スキーマはこの通常モジュールに分離している。
 */
export const entrySchema = z
  .object({
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    // 退勤は未入力(空文字)のまま保存できる(打刻の退勤未入力と同様の扱い)
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    transport_cost: z.coerce.number().int().min(0).max(100000),
    transport_mode: z.string().max(20).optional(),
    station_from: z.string().max(50).optional(),
    station_to: z.string().max(50).optional(),
    round_trip: z.string().optional(), // "on" or undefined(checkbox)
    note: z.string().max(200).optional(),
    // 昼食費の当日上書き(管理者のみ入力想定)。空欄なら「上書きなし」(undefined)であって
    // 0円指定と区別する必要があるため、z.coerce.number() ではなく手動で変換する。
    lunch_change_amount: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
      .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0), {
        message: "昼食費の変更金額は0以上の整数で入力してください",
      }),
    lunch_change_reason_type: z
      .enum(["in_kind", "other"])
      .optional()
      .or(z.literal("")),
    lunch_change_reason_note: z.string().max(100).optional(),
  })
  .refine(
    (d) => d.lunch_change_amount === undefined || !!d.lunch_change_reason_type,
    {
      message: "昼食費の変更金額を入力した場合は理由を選択してください",
    }
  )
  .refine(
    (d) =>
      d.lunch_change_reason_type !== "other" ||
      !!d.lunch_change_reason_note?.trim(),
    {
      message: "昼食費の変更理由で「その他」を選んだ場合は内容を入力してください",
    }
  )
  .refine(
    (d) => {
      if (!d.end_time) return true;
      // 退勤が出勤以前(例: 22:00→2:00)は翌日にまたぐ勤務として24時間を加算し、
      // 標準休憩(自動計算)を差し引いた実働が正であることを確認する。
      // ※スキーマはモジュール読み込み時に一度だけ定義されるため設定済みの休憩枠を
      // 参照できず既定値で判定するが、これは「明らかに短すぎる勤務」を弾く安全チェックに
      // すぎない(実際に保存される休憩時間は各アクション側で設定済みの休憩枠から計算する)。
      const [sh, sm] = d.start_time.split(":").map(Number);
      const [eh, em] = d.end_time.split(":").map(Number);
      let diff = eh * 60 + em - (sh * 60 + sm);
      if (diff <= 0) diff += 24 * 60;
      return diff - standardBreakMinutes(d.start_time, d.end_time) > 0;
    },
    {
      message:
        "勤務時間が正しくありません(休憩を差し引くと0以下です)。退勤が翌日にまたぐ場合(例: 2:00)もそのまま入力できます",
    }
  )
  .refine(
    (d) => {
      // 交通費は「手段・区間1・区間2・往復/片道・金額」を全てセットで入力する。
      // 何か1つでも入力されていれば全て必須、全て空欄(金額0・区間未入力)ならOK。
      const from = d.station_from?.trim() ?? "";
      const to = d.station_to?.trim() ?? "";
      const mode = d.transport_mode?.trim() ?? "";
      const cost = d.transport_cost;
      const anyEntered = from !== "" || to !== "" || cost > 0;
      if (!anyEntered) return true;
      return from !== "" && to !== "" && mode !== "" && cost > 0;
    },
    {
      message:
        "交通費は手段・区間1・区間2・往復/片道・金額をすべて入力してください(不要な場合はすべて空欄・0円に)",
    }
  );

/**
 * 勤務記録の削除に失敗したときのメッセージ。
 *
 * 前払金(`advance_payments`)は勤務実績を複合外部キーで参照しており、
 * **前払金が記録されている日の勤務実績は削除できない**(ON DELETE NO ACTION)。
 * 現金を渡した記録だけが残って給与計算で控除され続ける事故を防ぐための制約なので、
 * 「削除に失敗しました」ではなく、先に前払金を取り消す必要があることを伝える。
 * PostgreSQL の外部キー違反は 23503。
 */
export function deleteEntryErrorMessage(error: { code?: string } | null): string {
  if (error?.code === "23503") {
    return "この日は前払金が記録されているため削除できません。先に日別実績の画面で前払金を取り消してください。";
  }
  return "削除に失敗しました";
}
