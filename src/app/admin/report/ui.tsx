"use client";

import { useState, useTransition } from "react";
import { buildTaxReportCsv, sendTaxReport } from "./actions";

// アイコンではなく文字(PDF / CSV)で見せるボタン。「税理士へ」ボタンと高さ・配色を揃える
const textBtn =
  "inline-flex h-10 items-center justify-center rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50";

function MailIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </svg>
  );
}

/**
 * 給与明細の一覧をPDFでダウンロードする。
 *
 * スマホ(特に iOS の PWA)では window.print() が動作しないため、印刷ではなく
 * PDFダウンロードで内容を確認できるようにしている(QRコードのPDFと同じ方式)。
 * 画面の表をそのまま html2canvas で画像化し、jsPDF で A4横向きに貼り付ける。
 * 日本語はブラウザ側で描画されるため、PDFにフォントを埋め込む必要がない。
 * 縦に長い場合はページを分割する。
 *
 * @param targetId キャプチャ対象(表を含む枠)の要素id
 */
export function DownloadPdfButton({
  targetId,
  filename,
}: {
  targetId: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const el = document.getElementById(targetId);
    if (!el) {
      setError("出力対象が見つかりません");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // ⚠️ html2canvas(本家)ではなく html2canvas-pro を使うこと。
      // Tailwind v4 の標準カラーは oklch() で出力されるが、本家は oklch を解釈できず
      // 「Attempting to parse an unsupported color function」で失敗する(2026-07-31に発生)。
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      // キャプチャ中だけ画面外で全幅描画にする(globals.css の pdf-capture-mode)
      el.classList.add("pdf-capture-target");
      document.body.classList.add("pdf-capture-mode");
      try {
        // レイアウト反映を待ってから撮る
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });

        const pdf = new jsPDF({
          unit: "mm",
          format: "a4",
          orientation: "landscape",
        });
        const margin = 8;
        const pageW = 297;
        const pageH = 210;
        const imgW = pageW - margin * 2;
        // 画像の実寸(mm)。1mmあたりのピクセル数を出して、ページ高さで切り分ける
        const pxPerMm = canvas.width / imgW;
        const usableH = pageH - margin * 2;
        const sliceHpx = Math.floor(usableH * pxPerMm);

        let y = 0;
        let firstPage = true;
        while (y < canvas.height) {
          const h = Math.min(sliceHpx, canvas.height - y);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = h;
          const ctx = slice.getContext("2d");
          if (!ctx) throw new Error("canvas context を取得できませんでした");
          // 余白が透明にならないよう白で塗ってから貼る
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

          if (!firstPage) pdf.addPage();
          pdf.addImage(
            slice.toDataURL("image/png"),
            "PNG",
            margin,
            margin,
            imgW,
            h / pxPerMm
          );
          firstPage = false;
          y += h;
        }
        pdf.save(filename);
      } finally {
        // 例外時も必ず画面表示を元に戻す
        document.body.classList.remove("pdf-capture-mode");
        el.classList.remove("pdf-capture-target");
      }
    } catch (e) {
      // 原因を追えるよう、握りつぶさずエラー内容も出す
      const detail = e instanceof Error ? e.message : String(e);
      setError(`PDFの作成に失敗しました(${detail})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        aria-label="PDFダウンロード"
        title="PDFダウンロード"
        className={textBtn}
      >
        {busy ? "作成中..." : "PDF"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function DownloadCsvButton({ periodKey }: { periodKey: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-1">
      <button
        disabled={pending}
        aria-label="CSVダウンロード"
        title="CSVダウンロード"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await buildTaxReportCsv(periodKey);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            // CSV文字列をBlob化してダウンロード(メールに手動添付できる)
            const blob = new Blob([res.csv], {
              type: "text/csv;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = res.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          });
        }}
        className={textBtn}
      >
        {pending ? "作成中..." : "CSV"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function SendReportButton({ periodKey }: { periodKey: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await sendTaxReport(periodKey, note);
      setResult(res);
      if (res.ok) {
        setOpen(false);
        setNote("");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        aria-label="税理士へメール送信"
        title="税理士へメール送信"
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
      >
        <MailIcon className="h-5 w-5" />
        税理士へ
      </button>
      {result && (
        <span
          className={`text-xs ${result.ok ? "text-green-700" : "text-red-600"}`}
        >
          {result.message}
        </span>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">
              税理士へメール送信
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              支給一覧のCSVを添付して送信します。補足事項(申し送り事項)があれば入力してください。空欄でも送信できます。
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="例: 今月は〇〇さんが入社しました。ご確認をお願いします。"
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {result && !result.ok && (
              <p className="mt-2 text-sm text-red-600">{result.message}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "送信中..." : "送信する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
