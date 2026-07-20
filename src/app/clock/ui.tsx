"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { punchClock, type ClockResult } from "./actions";

type Coords = { lat: number; lng: number; accuracy: number | null };

export type TransportDefault = {
  mode: string;
  from: string;
  to: string;
  roundTrip: boolean;
  cost: number;
};

const TRANSPORT_MODES = ["鉄道", "バス", "自転車", "その他"];

/** "HH:MM" を単位(分)で丸める(サーバーの roundTime と同じ挙動・表示用) */
function roundHHMM(hhmm: string, unit: number, dir: "up" | "down"): string {
  if (!hhmm || !Number.isFinite(unit) || unit <= 1) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m;
  let r =
    dir === "up"
      ? Math.ceil(total / unit) * unit
      : Math.floor(total / unit) * unit;
  if (r > 1439) r = 1439;
  if (r < 0) r = 0;
  return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
}

export function ClockConfirm({
  employeeName,
  type,
  locationEnabled,
  roundMin,
  transportDefault,
}: {
  employeeName: string;
  type: "in" | "out";
  locationEnabled: boolean;
  roundMin: number;
  transportDefault: TransportDefault | null;
}) {
  const isIn = type === "in";
  const [now, setNow] = useState<string>("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "loading" | "ok" | "denied" | "unsupported"
  >(locationEnabled ? "loading" : "idle");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ClockResult | null>(null);

  // 交通費(最も最近の入力をデフォルト表示。開閉式で、必要な時だけ入力)
  const [showTransport, setShowTransport] = useState(false);
  const [tMode, setTMode] = useState(transportDefault?.mode ?? "鉄道");
  const [tFrom, setTFrom] = useState(transportDefault?.from ?? "");
  const [tTo, setTTo] = useState(transportDefault?.to ?? "");
  const [tRound, setTRound] = useState(transportDefault?.roundTrip ?? true);
  const [tCost, setTCost] = useState<string>(
    transportDefault?.cost ? String(transportDefault.cost) : ""
  );

  // 画面表示用の時計(実際の打刻時刻はサーバーが確定する)
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1000 * 10);
    return () => clearInterval(id);
  }, []);

  // 位置情報を取得(基準位置が設定されている場合のみ)
  useEffect(() => {
    if (!locationEnabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
        setGeoStatus("ok");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [locationEnabled]);

  async function submit() {
    setPending(true);
    try {
      const res = await punchClock({
        type,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        accuracy: coords?.accuracy ?? null,
        transport_mode: tMode,
        station_from: tFrom,
        station_to: tTo,
        round_trip: tRound,
        transport_cost: Number(tCost) || 0,
      });
      setResult(res);
    } catch (e) {
      setResult({
        ok: false,
        message:
          "打刻に失敗しました: " + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setPending(false);
    }
  }

  const accent = isIn
    ? "bg-green-600 hover:bg-green-700"
    : "bg-orange-500 hover:bg-orange-600";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {result?.ok ? (
          <div className="text-center">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white ${
                isIn ? "bg-green-600" : "bg-orange-500"
              }`}
            >
              ✓
            </div>
            <p className="text-lg font-bold text-gray-900">{result.message}</p>
            {result.warn && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {result.warn}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/timesheet"
                className="rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700"
              >
                勤務表を開く
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="text-center text-sm text-gray-500">
              {isIn ? "出勤の打刻" : "退勤の打刻"}
            </p>
            <p className="mt-1 text-center text-2xl font-bold text-gray-900">
              {employeeName} さん
            </p>
            <p
              className={`mt-4 text-center text-5xl font-extrabold tracking-tight ${
                isIn ? "text-green-700" : "text-orange-600"
              }`}
            >
              {isIn ? "出勤" : "退勤"}
            </p>
            <p className="mt-2 text-center text-3xl font-bold tabular-nums text-gray-800">
              {now}
            </p>
            {now && (
              <p className="mt-1 text-center text-sm text-gray-500">
                {roundHHMM(now, roundMin, isIn ? "up" : "down")}{" "}
                {isIn ? "出勤" : "退勤"} とみなします。
              </p>
            )}

            {locationEnabled && (
              <p className="mt-3 text-center text-xs text-gray-500">
                {geoStatus === "loading" && "位置情報を取得しています…"}
                {geoStatus === "ok" && "位置情報を取得しました"}
                {geoStatus === "denied" &&
                  "位置情報が許可されていません(位置なしで記録されます)"}
                {geoStatus === "unsupported" &&
                  "この端末では位置情報を取得できません"}
              </p>
            )}

            {/* 交通費(任意)。最も最近の入力を初期表示。開いて編集できる。 */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <button
                type="button"
                onClick={() => setShowTransport((v) => !v)}
                className="flex w-full items-center justify-between text-left text-sm font-semibold text-gray-700"
              >
                <span>
                  交通費
                  {tFrom && tTo && Number(tCost) > 0 && (
                    <span className="ml-2 font-normal text-gray-500">
                      {tFrom}
                      {tRound ? "⇔" : "→"}
                      {tTo} ¥{(Number(tCost) || 0).toLocaleString()}
                    </span>
                  )}
                </span>
                <span className="text-gray-400">{showTransport ? "▲" : "▼"}</span>
              </button>
              {showTransport && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={tMode}
                      onChange={(e) => setTMode(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                    >
                      <option value="">手段</option>
                      {TRANSPORT_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <input
                      value={tCost}
                      onChange={(e) => setTCost(e.target.value)}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={10}
                      placeholder="金額(円)"
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={tFrom}
                      onChange={(e) => setTFrom(e.target.value)}
                      placeholder="区間(From)"
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                    />
                    <input
                      value={tTo}
                      onChange={(e) => setTTo(e.target.value)}
                      placeholder="区間(To)"
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={tRound}
                        onChange={() => setTRound(true)}
                        className="h-4 w-4"
                      />
                      往復
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={!tRound}
                        onChange={() => setTRound(false)}
                        className="h-4 w-4"
                      />
                      片道
                    </label>
                  </div>
                  <p className="text-xs text-gray-400">
                    手段・区間・金額がすべて揃った時に記録します(不要なら空欄のまま)。
                  </p>
                </div>
              )}
            </div>

            {result && !result.ok && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
                {result.message}
              </p>
            )}

            <button
              onClick={submit}
              disabled={
                pending ||
                (locationEnabled && geoStatus === "loading") ||
                result?.blocked
              }
              className={`mt-6 w-full rounded-xl py-4 text-lg font-bold text-white disabled:opacity-50 ${
                result?.blocked ? "bg-gray-400 hover:bg-gray-400" : accent
              }`}
            >
              {result?.blocked
                ? "打刻できません"
                : pending
                  ? "記録中..."
                  : locationEnabled && geoStatus === "loading"
                    ? "位置情報を取得中..."
                    : `OK（${isIn ? "出勤" : "退勤"}を記録）`}
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">
              打刻時刻はサーバーの時刻で記録されます。
            </p>
          </>
        )}
      </div>
    </main>
  );
}
