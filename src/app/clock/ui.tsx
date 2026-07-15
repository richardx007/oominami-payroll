"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { punchClock, type ClockResult } from "./actions";

type Coords = { lat: number; lng: number; accuracy: number | null };

export function ClockConfirm({
  employeeName,
  type,
  locationEnabled,
}: {
  employeeName: string;
  type: "in" | "out";
  locationEnabled: boolean;
}) {
  const isIn = type === "in";
  const [now, setNow] = useState<string>("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "loading" | "ok" | "denied" | "unsupported"
  >(locationEnabled ? "loading" : "idle");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ClockResult | null>(null);

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

            {result && !result.ok && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
                {result.message}
              </p>
            )}

            <button
              onClick={submit}
              disabled={pending || (locationEnabled && geoStatus === "loading")}
              className={`mt-6 w-full rounded-xl py-4 text-lg font-bold text-white disabled:opacity-50 ${accent}`}
            >
              {pending
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
