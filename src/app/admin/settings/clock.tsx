"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import type { Map as LeafletMap, CircleMarker, Circle } from "leaflet";
import { updateClockSettings } from "./actions";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function ClockSettingsForm({
  companyName,
  lat,
  lng,
  radiusM,
  policy,
  roundMin,
}: {
  companyName: string;
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

      <QrCodes companyName={companyName} roundMin={round} />
    </section>
  );
}

/** 出勤/退勤QRの表示・印刷。URLは現在のオリジンから生成する。
 *  印刷時は QR コードのみ(会社名タイトル＋説明つき)を印刷する専用シートを出す。 */
function QrCodes({
  companyName,
  roundMin,
}: {
  companyName: string;
  roundMin: string;
}) {
  const [inUrl, setInUrl] = useState<string>("");
  const [outUrl, setOutUrl] = useState<string>("");
  const [installUrl, setInstallUrl] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  // iPhone/iPad をホーム画面に追加した状態(PWA standalone表示)では window.print() が
  // 動作しないため、その環境では「印刷」ボタン自体を表示しない(PDFダウンロードのみ案内)。
  const [printSupported, setPrintSupported] = useState(true);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    setPrintSupported(!(isIOS && isStandalone));
  }, []);

  useEffect(() => {
    const origin = window.location.origin;
    QRCode.toDataURL(`${origin}/clock?type=in`, { width: 480, margin: 1 }).then(
      setInUrl
    );
    QRCode.toDataURL(`${origin}/clock?type=out`, {
      width: 480,
      margin: 1,
    }).then(setOutUrl);
    // ホーム画面追加の案内ページ(/install)。出退勤QRより小さく表示する
    QRCode.toDataURL(`${origin}/install`, { width: 240, margin: 1 }).then(
      setInstallUrl
    );
  }, []);

  // 打刻時刻の丸め単位(0/1は丸めなし=1分単位として表示)
  const roundN = parseInt(roundMin, 10);
  const roundLabel = Number.isFinite(roundN) && roundN > 1 ? roundN : 1;
  const title = `${companyName ? companyName + "　" : ""}出退勤登録用QRコード`;

  /**
   * QRのみを印刷する。
   * 従来は現在のページの body にクラスを付けて他の要素を display:none にする方式だったが、
   * ブラウザによっては(内容量やレイアウトの端数次第で)空白の2ページ目が生成されることがあった。
   * 原因を確実に断定できなかったため、**印刷用の内容だけを持つ完全に独立した別ウィンドウ**を開いて
   * そこで印刷する方式に変更した。同じページの他の要素が一切混ざらないため、空白ページの原因を
   * 構造的に排除できる。
   */
  const handlePrint = () => {
    if (typeof window === "undefined" || !inUrl || !outUrl) return;
    const w = window.open("", "_blank");
    if (!w) {
      alert("ポップアップがブロックされました。ブラウザの設定を確認してください。");
      return;
    }
    const escapeHtml = (s: string) =>
      s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const doc = w.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  /* ページサイズだけ指定し、余白は指定しない(OS/ブラウザの既定に委ねる)。
     本文の高さも297mmぴったりには固定しない。1ページに強制的に合わせようとする
     (height を297mmに固定する等)と、OS側が独自に印刷余白を確保する環境で用紙から
     はみ出し、空白の2ページ目が生成されることがあったための対策。
     ホーム画面登録QRをできるだけ下に配置したい(出退勤QRを日常読み取る際に
     邪魔にならないように)ため、控えめな min-height(実測の余白を考慮し297mmより
     十分小さい値)のflexboxにして margin-top:auto で押し下げる。 */
  @page { size: A4 portrait; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 210mm;
    min-height: 230mm;
    display: flex;
    flex-direction: column;
    padding: 14mm 12mm;
    text-align: center;
    font-family: "Hiragino Kaku Gothic ProN","Hiragino Sans","BIZ UDPGothic",Meiryo,system-ui,sans-serif;
  }
  h1 { margin: 4mm 0 8mm; font-size: 20px; font-weight: 700; }
  .codes { display: flex; justify-content: center; gap: 12mm; }
  .code { border: 2px solid #333; border-radius: 8px; padding: 6mm; }
  .code img { width: 70mm; height: 70mm; display: block; }
  .label { font-size: 18px; font-weight: 700; margin-bottom: 4mm; }
  .in { color: #15803d; }
  .out { color: #ea580c; }
  ul { margin: 10mm auto 0; max-width: 160mm; text-align: left; font-size: 12px; line-height: 1.8; padding-left: 6mm; }
  /* margin-top:auto でページ下部(min-heightの範囲内)へ押し下げる */
  .install { margin: auto auto 0 auto; width: 100%; padding-top: 6mm; border-top: 1px solid #ddd; max-width: 160mm; }
  .install p { margin: 0 0 3mm; font-size: 13px; font-weight: 700; color: #333; }
  .install img { width: 28mm; height: 28mm; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="codes">
    <div class="code"><div class="label in">出勤</div><img src="${inUrl}" alt="出勤QR"></div>
    <div class="code"><div class="label out">退勤</div><img src="${outUrl}" alt="退勤QR"></div>
  </div>
  <ul>
    <li>出勤と退勤の際にそれぞれのQRコードをスマホのカメラで読み取って出退勤の登録を行なってください。</li>
    <li>記録される出退勤時刻は、${roundLabel} 分単位で丸められます。</li>
    <li>この職場以外からでは記録できませんので、必ずここで登録してください。</li>
  </ul>
  ${
    installUrl
      ? `<div class="install">
    <p>アプリをスマホのホーム画面に登録しましょう</p>
    <img src="${installUrl}" alt="ホーム画面登録の案内QR">
  </div>`
      : ""
  }
</body>
</html>`);
    doc.close();
    w.onafterprint = () => w.close();
    // data URL の画像描画を確実に待ってから印刷する
    w.setTimeout(() => {
      w.focus();
      w.print();
    }, 200);
  };

  /**
   * QRシートをPDFでダウンロードする。
   * iPhone/iPad の PWA(ホーム画面追加・standalone表示)では window.print() が動作しない
   * (WebKitの制限)ため、印刷に頼らず動作するダウンロード手段として用意する。
   * html2canvas で印刷用シート(.qr-print-sheet、印刷時と同じ見た目)をそのまま画像化し、
   * jsPDF でA4 1枚のPDFに貼り付ける(日本語テキストはブラウザ側で描画されるため、
   * PDF側にフォントを埋め込む必要がない)。
   */
  const handleDownloadPdf = async () => {
    if (typeof document === "undefined" || !inUrl || !outUrl || !sheetRef.current) {
      return;
    }
    setPdfBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      document.body.classList.add("qr-capture-mode");
      // レイアウト反映を待ってからキャプチャする
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      const canvas = await html2canvas(sheetRef.current, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
      pdf.save("出退勤QRコード.pdf");
    } catch {
      alert("PDFの作成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      document.body.classList.remove("qr-capture-mode");
      setPdfBusy(false);
    }
  };

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">
          出勤・退勤QRコード
        </h3>
        <div className="flex gap-2">
          {printSupported && (
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              印刷
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfBusy || !inUrl || !outUrl}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {pdfBusy ? "作成中..." : "PDFダウンロード"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        職場に掲示してください。従業員はスマホのカメラで読み取り、確認画面でOKすると打刻されます。
        {printSupported ? (
          <>
            「印刷」ではQRコードのみが印刷されます。iPhone/iPadでホーム画面に追加している場合は印刷が動作しないことが
            あるため、その場合は「PDFダウンロード」をお使いください。
          </>
        ) : (
          "この端末(ホーム画面に追加したiPhone/iPad)では印刷が動作しないため「PDFダウンロード」をお使いください。"
        )}
      </p>
      {/* 画面プレビュー用 */}
      <div className="mt-4 grid grid-cols-2 gap-4">
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

      {/* スマホのホーム画面追加(PWAインストール)案内用QR。出退勤QRより小さく下部に表示 */}
      <div className="mt-6 flex flex-col items-center gap-2 border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-500">
          このQRを読み取ると、スマホのホーム画面にアイコンを追加する手順が表示されます
        </p>
        {installUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={installUrl}
            alt="ホーム画面追加の案内QR"
            className="h-24 w-24 rounded-lg border border-gray-200 p-1"
          />
        )}
      </div>

      {/* 印刷専用シートは body 直下(portal)に置く。印刷時は他の body 直下要素を
          display:none にして高さごと除外するため、空白ページが出ない。 */}
      {mounted &&
        createPortal(
          <div className="qr-print-sheet" ref={sheetRef}>
            <h1 className="qr-print-title">{title}</h1>
            <div className="qr-print-codes">
              <div className="qr-print-code">
                <div className="qr-print-code-label qr-print-in">出勤</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {inUrl && <img src={inUrl} alt="出勤QR" />}
              </div>
              <div className="qr-print-code">
                <div className="qr-print-code-label qr-print-out">退勤</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {outUrl && <img src={outUrl} alt="退勤QR" />}
              </div>
            </div>
            <ul className="qr-print-notes">
              <li>
                出勤と退勤の際にそれぞれのQRコードをスマホのカメラで読み取って出退勤の登録を行なってください。
              </li>
              <li>
                記録される出退勤時刻は、{roundLabel} 分単位で丸められます。
              </li>
              <li>
                この職場以外からでは記録できませんので、必ずここで登録してください。
              </li>
            </ul>
            {installUrl && (
              <div className="qr-print-install">
                <p>アプリをスマホのホーム画面に登録しましょう</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={installUrl} alt="ホーム画面登録の案内QR" />
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
