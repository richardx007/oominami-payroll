import { z } from "zod";

/**
 * 勤務記録の入力スキーマ(従業員・管理者で共用)。
 * サーバーアクション("use server")からは関数しか export できないため、
 * スキーマはこの通常モジュールに分離している。
 */
export const entrySchema = z
  .object({
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    break_minutes: z.coerce.number().int().min(0).max(600),
    transport_cost: z.coerce.number().int().min(0).max(100000),
    transport_mode: z.string().max(20).optional(),
    station_from: z.string().max(50).optional(),
    station_to: z.string().max(50).optional(),
    round_trip: z.string().optional(), // "on" or undefined(checkbox)
    note: z.string().max(200).optional(),
  })
  .refine((d) => d.end_time > d.start_time, {
    message: "退勤時刻は出勤時刻より後にしてください",
  })
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
