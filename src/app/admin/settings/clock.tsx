"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import type { Map as LeafletMap, CircleMarker, Circle } from "leaflet";
import { updateClockSettings } from "./actions";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function ClockSettingsForm({
  lat,
  lng,
  radiusM,
  policy,
  roundMin,
}: {
  lat: string;
  lng: string;
  radiusM: string;
  policy: string;
  roundMin: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(
    lat && lng && Number.isFinite(parseFloat(lat))
      ? { lat: parseFloat(lat), lng: parseFloat(lng) }
      : null
  );
  const [radius, setRadius] = useState(radiusM || "100");
  const [pol, setPol] = useState(policy === "reject" ? "reject" : "warn");
  const [round, setRound] = useState(roundMin || "0");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // 地図の初期化(クライアントのみ)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || mapRef.current) return;
      LRef.current = L;
      const center = pos ?? { lat: 35.681236, lng: 139.767125 }; // 東京駅
      const map = L.map(mapEl.current).setView(
        [center.lat, center.lng],
        pos ? 16 : 13
      );
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        setPos({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      if (pos) drawOverlay(pos.lat, pos.lng);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawOverlay(la: number, ln: number) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      markerRef.current = L.circleMarker([la, ln], {
        radius: 7,
        color: "#152449",
        fillColor: "#2563eb",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
    const r = parseInt(radius, 10) || 0;
    if (!circleRef.current) {
      circleRef.current = L.circle([la, ln], {
        radius: r,
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 0.08,
        weight: 1,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng([la, ln]);
      circleRef.current.setRadius(r);
    }
  }

  // pos / radius 変更で地図上の目印と円を更新
  useEffect(() => {
    if (pos) drawOverlay(pos.lat, pos.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, radius]);

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const la = p.coords.latitude;
      const ln = p.coords.longitude;
      setPos({ lat: la, lng: ln });
      mapRef.current?.setView([la, ln], 16);
    });
  }

  function save() {
    const fd = new FormData();
    fd.set("clock_base_lat", pos ? String(pos.lat) : "");
    fd.set("clock_base_lng", pos ? String(pos.lng) : "");
    fd.set("clock_radius_m", radius || "0");
    fd.set("clock_out_of_range", pol);
    fd.set("clock_round_min", round || "0");
    startTransition(async () => setResult(await updateClockSettings(fd)));
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        QR打刻の位置設定
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        地図をタップして職場の基準位置を指定します(ピンをドラッグする代わりに、置きたい場所をタップ)。
        「現在地を使う」で今いる場所を基準にもできます。
      </p>

      {/* PC(lg以上)では地図を2/3・縦長にし、各設定と保存ボタンを右1/3へ寄せる。
          スクロール時にカーソルが地図に重なって拡大縮小してしまう問題を避けるため。 */}
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            ref={mapEl}
            className="h-64 w-full overflow-hidden rounded-lg border border-gray-300 lg:h-96"
            style={{ zIndex: 0 }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={useCurrentLocation}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              現在地を使う
            </button>
            <span className="text-xs text-gray-500">
              {pos
                ? `基準位置: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`
                : "基準位置: 未設定"}
            </span>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <label className="mb-1 block text-sm font-medium">
                許容半径(メートル)
              </label>
              <input
                type="number"
                min={0}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                圏外での打刻の扱い
              </label>
              <select
                value={pol}
                onChange={(e) => setPol(e.target.value)}
                className={inputClass}
              >
                <option value="warn">警告のみ(打刻は許可し、記録に残す)</option>
                <option value="reject">打刻拒否(圏外では打刻できない)</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-1 block text-sm font-medium">
                打刻時刻の丸め(分単位)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={round}
                onChange={(e) => setRound(e.target.value)}
                className={`${inputClass} sm:max-w-[10rem] lg:max-w-none`}
              />
              <p className="mt-1 text-xs text-gray-400">
                0または1で丸めなし。例: 30 の場合、出勤は切り上げ(8:45→9:00)、退勤は切り捨て(18:50→18:30)。
              </p>
            </div>
          </div>

          {result && (
            <p
              className={`mt-3 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
            >
              {result.message}
            </p>
          )}
          <button
            onClick={save}
            disabled={pending}
            className="mt-3 w-full rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto lg:w-full"
          >
            {pending ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>

      <QrCodes />
    </section>
  );
}

/** 出勤/退勤QRの表示・印刷。URLは現在のオリジンから生成する */
function QrCodes() {
  const [inUrl, setInUrl] = useState<string>("");
  const [outUrl, setOutUrl] = useState<string>("");

  useEffect(() => {
    const origin = window.location.origin;
    QRCode.toDataURL(`${origin}/clock?type=in`, { width: 320, margin: 1 }).then(
      setInUrl
    );
    QRCode.toDataURL(`${origin}/clock?type=out`, {
      width: 320,
      margin: 1,
    }).then(setOutUrl);
  }, []);

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          出勤・退勤QRコード
        </h3>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 print:hidden"
        >
          印刷
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500 print:hidden">
        職場に掲示してください。従業員はスマホのカメラで読み取り、確認画面でOKすると打刻されます。
      </p>
      <div className="clock-qr-print mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl border-2 border-green-600 p-4 text-center">
          <div className="text-lg font-bold text-green-700">出勤</div>
          {inUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inUrl} alt="出勤QR" className="mx-auto mt-2 w-full max-w-[220px]" />
          )}
        </div>
        <div className="rounded-xl border-2 border-orange-500 p-4 text-center">
          <div className="text-lg font-bold text-orange-600">退勤</div>
          {outUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={outUrl} alt="退勤QR" className="mx-auto mt-2 w-full max-w-[220px]" />
          )}
        </div>
      </div>
    </div>
  );
}
