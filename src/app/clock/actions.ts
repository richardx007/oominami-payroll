"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";
import {
  todayJST,
  nowTimeJST,
  businessDateOf,
  standardBreakMinutes,
} from "@/lib/period";
import { parseBreakWindows } from "@/lib/breaks";
import { logActivity } from "@/lib/log";

export type ClockResult = {
  ok: boolean;
  message: string;
  time?: string;
  warn?: string;
  /** true の場合、再試行しても結果は変わらない(例: 圏外での打刻拒否)。OKボタンを無効化する目安 */
  blocked?: boolean;
};

export type ClockInput = {
  type: "in" | "out";
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  // 交通費(任意。出勤・退勤どちらでも入力可能)。手段・区間・金額が揃った時のみ保存する。
  transport_mode?: string | null;
  station_from?: string | null;
  station_to?: string | null;
  round_trip?: boolean;
  transport_cost?: number | null;
};

/** 交通費が「手段・区間1・区間2・金額(>0)」まで揃っているか(揃った時のみ保存する) */
function transportFields(input: ClockInput) {
  const mode = input.transport_mode?.trim() ?? "";
  const from = input.station_from?.trim() ?? "";
  const to = input.station_to?.trim() ?? "";
  const cost = typeof input.transport_cost === "number" ? input.transport_cost : 0;
  if (from && to && mode && cost > 0) {
    return {
      transport_mode: mode,
      station_from: from,
      station_to: to,
      round_trip: input.round_trip ?? true,
      transport_cost: Math.min(cost, 100000),
    };
  }
  return null;
}

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

/** 距離(メートル)を表示用に整形。1000mを超える場合はkm換算(小数点第2位以下四捨五入) */
function formatDistance(m: number): string {
  if (m > 1000) {
    return `約 ${(Math.round(m / 100) / 10).toFixed(1)} km`;
  }
  return `約${Math.round(m)}m`;
}

/** RLSの行ポリシー違反(42501)かどうか。締め済み期間への書き込みは work_entries の
 *  RLS(is_period_open)で弾かれるため、原因不明の「登録に失敗」ではなく専用メッセージを返す */
function isRlsViolation(error: { code?: string } | null): boolean {
  return error?.code === "42501";
}

/**
 * "HH:MM" を単位(分)で丸める。up=切り上げ(出勤) / down=切り捨て(退勤)。unit<=0 は丸めなし。
 *
 * 23:5x台に出勤打刻すると切り上げで1440分(=24:00)以上になりうる。**日をまたいで
 * 翌日0時として扱う必要がある**(2026-08-01: 23:50出勤・丸め30分の打刻が「23:59」に
 * なってしまう不具合が発生。以前は1439分にクランプして当日内に押し込めていたのが原因)。
 * `dayOffset`(0 or 1)を呼び出し側に返し、`work_date` をその分だけ進めてもらう。
 */
function roundTime(
  hhmm: string,
  unit: number,
  dir: "up" | "down"
): { time: string; dayOffset: number } {
  if (!Number.isFinite(unit) || unit <= 1) return { time: hhmm, dayOffset: 0 };
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m;
  let rounded =
    dir === "up"
      ? Math.ceil(total / unit) * unit
      : Math.floor(total / unit) * unit;
  // 切り上げが 24:00 以上になった場合は翌日の 0 時として扱う(当日23:59に押し込めない)
  let dayOffset = 0;
  if (rounded >= 1440) {
    dayOffset = 1;
    rounded -= 1440;
  }
  if (rounded < 0) rounded = 0;
  const rh = Math.floor(rounded / 60);
  const rm = rounded % 60;
  return {
    time: `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`,
    dayOffset,
  };
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

  // 位置ポリシー・丸め設定。app_settings は管理者しか SELECT できないため、
  // clock_* だけを返す SECURITY DEFINER 関数 get_clock_settings() で取得する。
  const { data: settingsRows } = await supabase.rpc("get_clock_settings");
  const s = new Map(
    ((settingsRows ?? []) as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ])
  );
  const baseLat = parseFloat(s.get("clock_base_lat") ?? "");
  const baseLng = parseFloat(s.get("clock_base_lng") ?? "");
  const radius = parseInt(s.get("clock_radius_m") ?? "", 10);
  const policy = s.get("clock_out_of_range") === "reject" ? "reject" : "warn";
  const roundMin = parseInt(s.get("clock_round_min") ?? "", 10);
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
    // 圏外による打刻拒否は運用上の想定内の状況(システム障害ではない)のため「エラー」ではなく
    // 専用カテゴリ「打刻拒否」で記録する
    await logActivity(
      "打刻拒否",
      `打刻拒否(圏外): ${employee.name} ${type === "in" ? "出勤" : "退勤"} 距離${formatDistance(distance_m!)}`
    );
    return {
      ok: false,
      message: `職場から${formatDistance(distance_m!)}離れているため打刻できません。管理者にご連絡ください。`,
      // 同じ場所からの再試行では結果が変わらないため、OKボタンを無効化する目安として返す
      blocked: true,
    };
  }

  // 丸め: 出勤は単位で切り上げ、退勤は切り捨て(単位0/未設定なら丸めなし)。
  // 出勤の切り上げが24:00をまたいだ場合(例: 23:50を30分単位で切り上げ→翌日0:00)は
  // dayOffset=1 が返るので、実日付を1日進めてから業務日付に変換する(§roundTime参照)。
  const now = new Date();
  const { time, dayOffset } = roundTime(
    nowTimeJST(now),
    roundMin,
    type === "in" ? "up" : "down"
  );
  const realDate = todayJST(
    dayOffset ? new Date(now.getTime() + dayOffset * 86400000) : now
  );
  // 日をまたぐ深夜勤務は前日の業務として扱う(業務日付)。5時より前に始まる勤務は前日扱い。
  // 例) 23:50打刻→丸めて翌0:00→実日付は翌日だが業務日付は当日に戻る。
  //     深夜勤務(0:00〜9:00)の退勤9:00は5時以降なので実日付のまま業務日付になるが、
  //     退勤は「業務日付以前の未退勤レコード」を探すため正しく前日のシフトに紐付く。
  const date = businessDateOf(realDate, time);

  // 対象日の給与期間が締め済み(受付中でない)なら、DBのRLSで弾かれる前に分かりやすいメッセージを返す
  // (締め処理が月末より早く行われた場合など、原因不明の「登録に失敗」表示を避けるため)
  const { data: periodOpen } = await supabase.rpc("is_period_open", {
    d: date,
  });
  if (periodOpen === false) {
    return {
      ok: false,
      message: "既に今月は締められています。管理者にご連絡ください。",
    };
  }

  const transport = transportFields(input);
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
          transport_cost: transport?.transport_cost ?? 0,
          ...(transport ?? {}),
          updated_by: employee.id,
        },
        { onConflict: "employee_id,work_date" }
      )
      .select("id")
      .single();
    if (error) {
      await logActivity("エラー", `出勤打刻に失敗: ${employee.name} ${error.message}`);
      return {
        ok: false,
        message: isRlsViolation(error)
          ? "既に今月は締められています。管理者にご連絡ください。"
          : "出勤の登録に失敗しました。時間をおいて再度お試しください。",
      };
    }
    workEntryId = ins.id;
  } else {
    // 退勤の紐付け対象を決める。未来日の別レコードに書かないよう work_date <= 当日 に限定する。
    // 1) 当日以前で「未退勤(end なし)」の直近レコード(=現在のシフト。前日出勤の深夜勤務にも対応)
    const { data: open } = await supabase
      .from("work_entries")
      .select("id, start_time")
      .eq("employee_id", employee.id)
      .lte("work_date", date)
      .is("end_time", null)
      .not("start_time", "is", null)
      .order("work_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    let target = open;
    // 2) 未退勤が無ければ「当日」のレコードに上書き(再退勤・訂正)
    if (!target) {
      const { data: todayEntry } = await supabase
        .from("work_entries")
        .select("id, start_time")
        .eq("employee_id", employee.id)
        .eq("work_date", date)
        .not("start_time", "is", null)
        .maybeSingle();
      target = todayEntry ?? null;
    }
    if (!target) {
      return {
        ok: false,
        message: "本日の出勤記録が見つかりません。先に出勤QRを読み取ってください。",
      };
    }
    // 休憩は標準休憩ルール(設定画面「休憩時間」。既定12-13/19-20/4-5時)から自動計算する
    const { data: breakSettings } = await supabase.rpc("get_break_settings");
    const breakWindows = parseBreakWindows(breakSettings);
    const brk = standardBreakMinutes(target.start_time.slice(0, 5), time, breakWindows);
    const { error } = await supabase
      .from("work_entries")
      .update({
        end_time: time,
        break_minutes: brk,
        ...(transport ?? {}),
        updated_by: employee.id,
      })
      .eq("id", target.id);
    if (error) {
      await logActivity("エラー", `退勤打刻に失敗: ${employee.name} ${error.message}`);
      return {
        ok: false,
        message: isRlsViolation(error)
          ? "既に今月は締められています。管理者にご連絡ください。"
          : "退勤の登録に失敗しました。時間をおいて再度お試しください。",
      };
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

  // 圏外での打刻(警告のみポリシーで通した分)は「圏外打刻」カテゴリで記録し、
  // ログ画面でオレンジ色のバッジで目立たせる(通常の「打刻」と区別)
  await logActivity(
    out_of_range === true ? "圏外打刻" : "打刻",
    `${type === "in" ? "出勤" : "退勤"} ${time}${
      Number.isFinite(roundMin) && roundMin > 1 ? `(丸め${roundMin}分)` : ""
    }${out_of_range === true ? ` (圏外 ${formatDistance(distance_m!)})` : ""}${
      location_denied && hasBase ? " (位置なし)" : ""
    }`
  );
  revalidatePath("/timesheet");

  const warn =
    out_of_range === true
      ? `職場から${formatDistance(distance_m!)}離れた場所での打刻として記録しました。`
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
