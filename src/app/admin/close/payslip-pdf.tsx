"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { captureElementToPdfBlob } from "@/lib/pdf-capture";
import { formatMinutes } from "@/lib/period";
import type { PayslipIssuer } from "@/lib/payslip-issuer";
import type { PayslipResult } from "@/lib/payroll";

/** 従業員1人分の給与明細PDFに必要なデータ(サーバーコンポーネントから受け取る) */
export type PayslipPdfData = {
  name: string;
  /** "2026年7月度" */
  periodLabel: string;
  /** "YYYY-MM"(ファイル名に使う) */
  periodKey: string;
  /** 期間の開始日・終了日・支払日("YYYY-MM-DD") */
  start: string;
  end: string;
  paymentDate: string;
  /** 締め前(未確定)かどうか。未確定のときは明細に注記を出す */
  draft: boolean;
  result: PayslipResult;
};

const yen = (n: number) => `¥${n.toLocaleString()}`;
const slash = (d: string) => d.replaceAll("-", "/");

/** 明細書の原寸幅(px)と、A4縦の比率で決まる最低高さ。プレビューはこれを縮小して見せる */
const SHEET_W = 760;
const SHEET_MIN_H = Math.round((SHEET_W * 297) / 210);

/**
 * この端末がPDFファイルの共有(OSの共有シート)に対応しているか。
 * iPhone/iPad・Android の Safari/Chrome は対応、PCブラウザの多くは非対応。
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
 * 従業員1人分の給与明細を、まずプレビューで見せてから
 * 「ダウンロード」か「共有」を選べるようにするボタン(給与明細画面の各行の右端)。
 *
 * プレビューの作り方は biz-management の請求書プレビュー(app/src/routes/InvoiceDoc.tsx)に倣う。
 * 画面に見せるノードと、PDFに撮るノードは**別々に持つ**のが要点で、
 * 見せる側だけ `transform: scale()` で画面幅に縮めるため、縮小がPDFの解像度に影響しない。
 */
export function PayslipPdfButton({
  data,
  issuer,
}: {
  data: PayslipPdfData;
  issuer: PayslipIssuer;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${data.name}の給与明細をPDFで出力`}
        title="この従業員の給与明細をPDFで出力"
        className="inline-flex h-8 items-center justify-center rounded-lg border border-blue-300 bg-white px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
      >
        PDF
      </button>
      {open && (
        <PayslipPdfDialog
          data={data}
          issuer={issuer}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** プレビュー + ダウンロード/共有のダイアログ */
function PayslipPdfDialog({
  data,
  issuer,
  onClose,
}: {
  data: PayslipPdfData;
  issuer: PayslipIssuer;
  onClose: () => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [previewHeight, setPreviewHeight] = useState<number | undefined>();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ダイアログはクリックで初めて描画されるため、サーバー側では描画されない。
  // よって判定を初期値に入れてもハイドレーションのずれは起きない
  const [shareable] = useState(canSharePdf);

  const filename = `給与明細_${data.periodKey}_${data.name}.pdf`;

  // プレビューを画面幅に合わせて縮小する。A4の原寸(760px)より狭い端末では1未満になる。
  // ResizeObserver は監視を始めた時点で1回呼ばれるので、初回の測定もこれに任せる
  // (effect本体で直接 setState しないため)
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const ro = new ResizeObserver(() => {
      const k = Math.min(1, wrap.clientWidth / inner.offsetWidth);
      setScale(k);
      setPreviewHeight(inner.offsetHeight * k);
    });
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // ダイアログを開いた時点でPDFを作っておく。
  // ⚠️ 「共有」を押してから作ると、iOS では navigator.share() が
  // 「ユーザー操作から直接呼ばれていない」と見なされて弾かれる。
  // 先に作っておき、共有ボタンでは待たずに share() を呼ぶ。
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const el = captureRef.current;
        if (!el) throw new Error("出力対象が見つかりません");
        // 印の画像(data URL)が描画し終わる前に撮ると印が抜けるので、先に読み込みを待つ
        await Promise.all(
          Array.from(el.querySelectorAll("img")).map((img) =>
            img.decode().catch(() => undefined)
          )
        );
        const made = await captureElementToPdfBlob(el, {
          orientation: "portrait",
        });
        if (alive) setBlob(made);
      } catch (e) {
        // 原因を追えるよう、握りつぶさずエラー内容も出す
        const detail = e instanceof Error ? e.message : String(e);
        if (alive) setError(`PDFの作成に失敗しました(${detail})`);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function download() {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function share() {
    if (!blob) return;
    const file = new File([blob], filename, { type: "application/pdf" });
    // await を挟まずそのまま呼ぶこと(上の useEffect のコメント参照)
    navigator
      .share({ files: [file], title: filename })
      .catch((e: unknown) => {
        // 共有シートを閉じただけ(キャンセル)はエラー扱いしない
        if (e instanceof DOMException && e.name === "AbortError") return;
        const detail = e instanceof Error ? e.message : String(e);
        setError(`共有できませんでした(${detail})`);
      });
  }

  const busy = !blob && !error;

  // ダイアログは body 直下に出す。表(overflow-x:auto の枠)の中に置いたままだと、
  // 祖先に transform 等が付いたときに position:fixed の基準がずれて隠れうるため
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${data.name}の給与明細プレビュー`}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-bold text-gray-900">
            {data.name} さんの給与明細
          </h3>
          <span className="shrink-0 text-xs text-gray-500">
            {data.periodLabel}
          </span>
        </div>

        {/* プレビュー。原寸(760px幅)のまま transform で縮めて見せる */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
          <div
            ref={wrapRef}
            style={{ height: previewHeight }}
            className="overflow-hidden rounded border border-gray-300 bg-white shadow-sm"
          >
            <div
              ref={innerRef}
              style={{
                width: SHEET_W,
                minHeight: SHEET_MIN_H,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <PayslipSheet data={data} issuer={issuer} />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {busy && (
            <p className="mb-2 text-sm text-gray-500">PDFを作成しています...</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              閉じる
            </button>
            {shareable && (
              <button
                type="button"
                onClick={share}
                disabled={!blob}
                className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                共有
              </button>
            )}
            <button
              type="button"
              onClick={download}
              disabled={!blob}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              ダウンロード
            </button>
          </div>
        </div>
      </div>

      {/* PDFに撮るノード。プレビューとは別に**原寸のまま**画面外に置く
          (一覧表のPDF = globals.css の .pdf-capture-target と同じ方式)。
          display:none だとレイアウトされずキャプチャできないので、必ず画面外配置にすること。 */}
      <div
        ref={captureRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-[-10000px] top-0 -z-10 bg-white"
        style={{ width: SHEET_W, minHeight: SHEET_MIN_H }}
      >
        <PayslipSheet data={data} issuer={issuer} />
      </div>
    </div>,
    document.body
  );
}

/** 給与明細書(A4縦)の中身。プレビューとPDFキャプチャの両方で同じものを使う */
function PayslipSheet({
  data,
  issuer,
}: {
  data: PayslipPdfData;
  issuer: PayslipIssuer;
}) {
  const r = data.result;

  return (
    <div className="px-10 py-8 text-[13px] leading-relaxed text-gray-900">
      {/* 見出しと支払元。支払元(2行)と印は要望どおり右上に置く */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-widest">給与明細書</h1>
          <p className="mt-1 text-sm text-gray-600">{data.periodLabel}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right text-sm">
            <div>{issuer.line1}</div>
            <div>{issuer.line2}</div>
          </div>
          {issuer.sealDataUrl && (
            // 印。data URL なので外部読み込み(CORS)は発生しない
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={issuer.sealDataUrl}
              alt="印"
              className="h-16 w-16 object-contain"
            />
          )}
        </div>
      </div>

      <div className="mt-6 border-b border-gray-300 pb-3">
        <div className="text-lg font-bold">{data.name} 様</div>
        <div className="mt-1 text-xs text-gray-600">
          対象期間 {slash(data.start)} 〜 {slash(data.end)}　／　支払日{" "}
          {slash(data.paymentDate)}
        </div>
        {data.draft && (
          <div className="mt-1 text-xs text-amber-700">
            ※ この明細は締め前の計算結果です(確定額ではありません)
          </div>
        )}
      </div>

      <SheetSection title="勤務" />
      <SheetRow label="勤務日数" value={`${r.work_days}日`} />
      <SheetRow label="勤務時間" value={formatMinutes(r.total_minutes)} />
      {r.night_minutes > 0 && (
        <SheetRow
          label="うち深夜勤務(22:00〜翌5:00)"
          value={formatMinutes(r.night_minutes)}
        />
      )}
      {r.overtime_minutes > 0 && (
        <SheetRow
          label="うち残業(1日8時間超)"
          value={formatMinutes(r.overtime_minutes)}
        />
      )}

      <SheetSection title="支給" />
      {/* 月度の途中で時給が変わった場合は時給ごとに行を分ける(画面の一覧表と同じ扱い) */}
      {r.wage_breakdown.map((b, i) => (
        <div key={i}>
          <SheetRow
            label={`基本給(時給 ${yen(b.hourly_wage)})`}
            value={yen(b.base_pay)}
          />
          {b.night_pay > 0 && (
            <SheetRow
              label={`深夜勤務手当(時給25%増 ${yen(
                Math.round(b.hourly_wage * 0.25)
              )})`}
              value={yen(b.night_pay)}
            />
          )}
          {b.overtime_pay > 0 && (
            <SheetRow
              label={`残業手当(時給25%増 ${yen(
                Math.round(b.hourly_wage * 0.25)
              )})`}
              value={yen(b.overtime_pay)}
            />
          )}
        </div>
      ))}
      <SheetRow label="交通費 *" value={yen(r.transport_total)} />
      <SheetRow label="昼食補助" value={yen(r.lunch_total)} />
      <SheetRow label="総支給額" value={yen(r.gross_pay)} bold />

      <SheetSection title="控除" />
      <SheetRow label="課税対象額(交通費を除く)" value={yen(r.taxable_amount)} />
      <SheetRow
        label={`源泉所得税(${r.tax_category === "kou" ? "甲欄" : "乙欄"})`}
        value={`−${yen(r.income_tax)}`}
      />
      {r.advance_deduction > 0 && (
        <SheetRow
          label="前払金(日当としてお支払い済み)"
          value={`−${yen(r.advance_deduction)}`}
        />
      )}

      <div className="mt-4 flex items-baseline justify-between border-t-2 border-gray-800 pt-3">
        <span className="text-base font-bold">差引支給額</span>
        <span className="text-2xl font-bold tabular-nums">{yen(r.net_pay)}</span>
      </div>

      <p className="mt-6 text-[11px] text-gray-500">* 交通費は課税対象外です。</p>
    </div>
  );
}

function SheetSection({ title }: { title: string }) {
  return (
    <div className="mt-5 border-b border-gray-300 pb-1 text-xs font-bold tracking-widest text-gray-600">
      {title}
    </div>
  );
}

function SheetRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between border-b border-gray-100 py-1.5 ${
        bold ? "font-bold" : ""
      }`}
    >
      <span className="text-gray-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
