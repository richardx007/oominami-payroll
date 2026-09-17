"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PdfResult } from "@/lib/pdf-capture";

/**
 * スマホ・タブレットか(= ダウンロードしても扱いにくい端末か)。
 *
 * ⚠️ 「共有できるか(`canSharePdf`)」で代用しないこと。**macOS の Safari/Chrome も
 * `navigator.canShare({files})` が真になる**ため、それをスマホ判定に使うと
 * PCでも「ダウンロード」が消えてしまう(2026-09-11に発生)。
 * iPadOS は Mac を名乗るので、タッチ点数で見分ける(clock.tsx の印刷可否判定と同じ方法)。
 */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/**
 * この端末がPDFファイルの共有(OSの共有シート)に対応しているか。
 * iPhone/iPad・Android のほか、macOS の Safari/Chrome も対応する。
 * 非対応の端末では「共有」ボタン自体を出さない。
 */
function canSharePdf(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Uint8Array()], "dummy.pdf", {
      type: "application/pdf",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * PDF出力の共通ダイアログ。**アプリ内のPDFボタンはすべてこれを通す**(2026-09-11に統一)。
 *
 * 開くとすぐPDFを作り、**出来上がったページ画像をそのままプレビュー**として見せてから、
 * 「ダウンロード」または「共有」を選ばせる。
 *
 * ⚠️ **PDFはダイアログを開いた時点で先に作ること**(この実装がそうしている)。
 * 「共有」を押してから作ると、iOS では `navigator.share()` が
 * 「ユーザー操作から直接呼ばれていない」と見なされて弾かれる。
 *
 * @param make PDFを作る処理。呼び出し側がキャプチャ対象と方式を決める
 *   (一覧表=`captureElementToPdfBlob` / 帳票=`captureSheetToPdfBlob` など)。
 */
export function PdfPreviewDialog({
  title,
  subtitle,
  filename,
  make,
  onClose,
  kindLabel = "PDF",
}: {
  title: string;
  subtitle?: string;
  /** 出力物の呼び名（「PDFを作成しています」等の文言）。画像を出す場合は "画像"（営業カレンダーのポスター） */
  kindLabel?: string;
  /** 保存・共有するときのファイル名(拡張子込み) */
  filename: string;
  make: () => Promise<PdfResult>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ダイアログはクリックで初めて描画されるため、サーバー側では描画されない。
  // よって判定を初期値に入れてもハイドレーションのずれは起きない
  const [shareable] = useState(canSharePdf);
  const [mobile] = useState(isMobileDevice);
  // スマホ・タブレットではダウンロードしても扱いにくいので「共有」に一本化する。
  // PCは「ダウンロード」を主ボタンにし、共有できる端末なら「共有」も併せて出す。
  const shareOnly = mobile && shareable;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const made = await make();
        if (alive) setResult(made);
      } catch (e) {
        // 原因を追えるよう、握りつぶさずエラー内容も出す
        const detail = e instanceof Error ? e.message : String(e);
        if (alive) setError(`${kindLabel}の作成に失敗しました(${detail})`);
      }
    })();
    return () => {
      alive = false;
    };
    // make は呼び出し側で毎回作られる無名関数なので依存に入れない(入れると作り直しが無限に走る)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function share() {
    if (!result) return;
    const file = new File([result.blob], filename, {
      type: result.blob.type || "application/pdf",
    });
    // await を挟まずそのまま呼ぶこと(上の useEffect のコメント参照)
    navigator.share({ files: [file], title: filename }).catch((e: unknown) => {
      // 共有シートを閉じただけ(キャンセル)はエラー扱いしない
      if (e instanceof DOMException && e.name === "AbortError") return;
      const detail = e instanceof Error ? e.message : String(e);
      setError(`共有できませんでした(${detail})`);
    });
  }

  const busy = !result && !error;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${title}のプレビュー`}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          {subtitle && (
            <span className="shrink-0 text-xs text-gray-500">{subtitle}</span>
          )}
        </div>

        {/* プレビュー = 出来上がったPDFのページ画像そのもの */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-gray-100 p-4">
          {busy && (
            <p className="py-10 text-center text-sm text-gray-500">
              {kindLabel}を作成しています...
            </p>
          )}
          {result?.pages.map((src, i) => (
            <div key={i}>
              {result.pages.length > 1 && (
                <p className="mb-1 text-xs text-gray-500">
                  {i + 1} / {result.pages.length} ページ
                </p>
              )}
              {/* 生成済みの data URL を出すだけなので next/image は使わない */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${title} ${i + 1}ページ目`}
                className="w-full rounded border border-gray-300 bg-white shadow-sm"
              />
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 px-5 py-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              閉じる
            </button>
            {/* 「共有」: スマホでは唯一の主ボタン(ブルー)、PCでは副ボタン(枠線) */}
            {shareable && (
              <button
                type="button"
                onClick={share}
                disabled={!result}
                className={
                  shareOnly
                    ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    : "rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                }
              >
                共有
              </button>
            )}
            {/* 「ダウンロード」を隠すのはスマホのときだけ */}
            {!shareOnly && (
              <button
                type="button"
                onClick={download}
                disabled={!result}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                ダウンロード
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
