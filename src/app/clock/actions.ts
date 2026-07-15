"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import { todayJST, nowTimeJST, workMinutes } from "@/lib/period";
import { logActivity } from "@/lib/log";

export type ClockResult = {
  ok: boolean;
  message: string;
  time?: string;
  warn?: string;
};

export type ClockInput = {
  type: "in" | "out";
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
};

/** 2点間の距離(メートル)。Haversine */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * QR打刻。出勤/退勤を打刻し work_entries に反映する。
 * - 時刻はサーバー(JST)の現在時刻を用いる(クライアント時刻は信頼しない)。
 * - 出勤: 当日すでに出勤済みなら2回目以降はエラー。
 * - 退勤: 直近の未退勤レコードに end_time を上書き(繰り返し可・休憩は6h以上で60分自動)。
 * - 位置: 基準座標が設定され「圏外時=拒否」の場合、圏外なら打刻しない。それ以外は記録のみ。
 */
export async function punchClock(input: ClockInput): Promise<ClockResult> {
  const employee = await requireEmployee();
  const supabase = await createClient();
  const type: "in" | "out" = input.type === "out" ? "out" : "in";

  // 位置ポリシー
  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "clock_base_lat",
      "clock_base_lng",
      "clock_radius_m",
      "clock_out_of_range",
    ]);
  const s = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const baseLat = parseFloat(s.get("clock_base_lat") ?? "");
  const baseLng = parseFloat(s.get("clock_base_lng") ?? "");
  const radius = parseInt(s.get("clock_radius_m") ?? "", 10);
  const policy = s.get("clock_out_of_range") === "reject" ? "reject" : "warn";
  const hasBase =
    Number.isFinite(baseLat) && Number.isFinite(baseLng) && radius > 0;
  const hasCoords =
    typeof input.lat === "number" && typeof input.lng === "number";

  let distance_m: number | null = null;
  let out_of_range: boolean | null = null;
  if (hasBase && hasCoords) {
    distance_m = haversineMeters(baseLat, baseLng, input.lat!, input.lng!);
    out_of_range = distance_m > radius;
  }
  const location_denied = !hasCoords;

  const h = await headers();
  const ua = h.get("user-agent") ?? null;

  // 圏外かつ拒否ポリシーなら打刻しない(試行は記録する)
  if (hasBase && out_of_range === true && policy === "reject") {
    await supabase.from("clock_events").insert({
      employee_id: employee.id,
      type,
      event_at: new Date().toISOString(),
      work_entry_id: null,
      latitude: input.lat ?? null,
      longitude: input.lng ?? null,
      accuracy: input.accuracy ?? null,
      distance_m,
      out_of_range,
      location_denied,
      user_agent: ua,
    });
    await logActivity(
      "エラー",
      `打刻拒否(圏外): ${employee.name} ${type === "in" ? "出勤" : "退勤"} 距離約${Math.round(distance_m!)}m`
    );
    return {
      ok: false,
      message: `職場から約${Math.round(distance_m!)}m離れているため打刻できません。管理者にご連絡ください。`,
    };
  }

  const date = todayJST();
  const time = nowTimeJST();
  let workEntryId: string | null = null;

  if (type === "in") {
    const { data: existing } = await supabase
      .from("work_entries")
      .select("id, start_time")
      .eq("employee_id", employee.id)
      .eq("work_date", date)
      .maybeSingle();
    if (existing?.start_time) {
      return {
        ok: false,
        message: "本日はすでに出勤打刻済みです。退勤時に退勤QRを読み取ってください。",
      };
    }
    const { data: ins, error } = await supabase
      .from("work_entries")
      .upsert(
        {
          employee_id: employee.id,
          work_date: date,
          start_time: time,
          end_time: null,
          break_minutes: 0,
          transport_cost: 0,
        },
        { onConflict: "employee_id,work_date" }
      )
      .select("id")
      .single();
    if (error) {
      return { ok: false, message: "出勤の登録に失敗しました: " + error.message };
    }
    workEntryId = ins.id;
  } else {
    // 退勤: 直近の未退勤レコードを優先。無ければ直近のレコードに上書き(再退勤)。
    const { data: open } = await supabase
      .from("work_entries")
      .select("id, start_time")
      .eq("employee_id", employee.id)
      .is("end_time", null)
      .not("start_time", "is", null)
      .order("work_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    let target = open;
    if (!target) {
      const { data: latest } = await supabase
        .from("work_entries")
        .select("id, start_time")
        .eq("employee_id", employee.id)
        .not("start_time", "is", null)
        .order("work_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = latest ?? null;
    }
    if (!target) {
      return {
        ok: false,
        message: "出勤の記録が見つかりません。先に出勤QRを読み取ってください。",
      };
    }
    // 休憩の自動判定: 総時間(end-start, 日跨ぎ補正込み)が6時間以上なら60分
    const span = workMinutes(target.start_time.slice(0, 5), time, 0);
    const brk = span >= 360 ? 60 : 0;
    const { error } = await supabase
      .from("work_entries")
      .update({ end_time: time, break_minutes: brk })
      .eq("id", target.id);
    if (error) {
      return { ok: false, message: "退勤の登録に失敗しました: " + error.message };
    }
    workEntryId = target.id;
  }

  await supabase.from("clock_events").insert({
    employee_id: employee.id,
    type,
    event_at: new Date().toISOString(),
    work_entry_id: workEntryId,
    latitude: hasCoords ? input.lat : null,
    longitude: hasCoords ? input.lng : null,
    accuracy: input.accuracy ?? null,
    distance_m,
    out_of_range,
    location_denied,
    user_agent: ua,
  });

  await logActivity(
    "打刻",
    `${type === "in" ? "出勤" : "退勤"} ${time}${
      out_of_range === true ? ` (圏外 約${Math.round(distance_m!)}m)` : ""
    }${location_denied && hasBase ? " (位置なし)" : ""}`
  );
  revalidatePath("/timesheet");

  const warn =
    out_of_range === true
      ? `職場から約${Math.round(distance_m!)}m離れた場所での打刻として記録しました。`
      : location_denied && hasBase
        ? "位置情報が取得できなかったため、位置なしで記録しました。"
        : undefined;

  return {
    ok: true,
    message:
      type === "in" ? `出勤を記録しました (${time})` : `退勤を記録しました (${time})`,
    time,
    warn,
  };
}
