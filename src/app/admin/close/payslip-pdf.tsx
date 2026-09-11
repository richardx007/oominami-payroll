"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * 従業員1人分の給与明細をA4縦のPDFでダウンロードするボタン。
 *
 * 一覧表のPDF(admin/report/ui.tsx の DownloadPdfButton)と違い、画面に出ている表ではなく
 * 明細書専用のレイアウト(下の PayslipSheet)を画面外に描いてから html2canvas で撮る。
 * 押したときだけ描画するので、従業員が何人いても通常時のDOMは増えない。
 *
 * ⚠️ Tailwind v4 のユーティリティ(oklch)を使ったDOMなので、キャプチャは
 * html2canvas-pro を使う captureElementToPdfBlob 側に任せること(本家 html2canvas は
 * oklch を解釈できず失敗する。docs/handover.md 参照)。
 */
export function PayslipPdfButton({
  data,
  issuer,
}: {
  data: PayslipPdfData;
  issuer: PayslipIssuer;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // generating が true になった描画のあとに、実際にキャプチャする
  // (明細書のDOMが存在してレイアウトされてからでないと撮れないため)
  useEffect(() => {
    if (!generating) return;
    let alive = true;
    (async () => {
      try {
        const el = sheetRef.current;
        if (!el) throw new Error("出力対象が見つかりません");
        // 印の画像(data URL)が描画し終わる前に撮ると印が抜けるので、先に読み込みを待つ
        await Promise.all(
          Array.from(el.querySelectorAll("img")).map((img) =>
            img.decode().catch(() => undefined)
          )
        );
        const blob = await captureElementToPdfBlob(el, {
          orientation: "portrait",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `給与明細_${data.periodKey}_${data.name}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (alive) setError(null);
      } catch (e) {
        // 原因を追えるよう、握りつぶさずエラー内容も出す
        const detail = e instanceof Error ? e.message : String(e);
        if (alive) setError(`PDFの作成に失敗しました(${detail})`);
      } finally {
        if (alive) setGenerating(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [generating, data.periodKey, data.name]);

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={generating}
        onClick={() => {
          setError(null);
          setGenerating(true);
        }}
        aria-label={`${data.name}の給与明細をPDFでダウンロード`}
        title="この従業員の給与明細をPDFでダウンロード"
        className="inline-flex h-8 items-center justify-center rounded-lg border border-blue-300 bg-white px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
      >
        {generating ? "作成中..." : "PDF"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
      {generating && (
        // キャプチャ対象。一覧表のPDF(globals.css の .pdf-capture-target)と同じく
        // 画面外(left:-10000px)に置いてから撮る。display:none だとレイアウトされず
        // キャプチャできないので、必ず「画面外に配置」にすること。
        <div
          ref={sheetRef}
          className="pointer-events-none fixed left-[-10000px] top-0 -z-10 w-[760px] bg-white"
        >
          <PayslipSheet data={data} issuer={issuer} />
        </div>
      )}
    </span>
  );
}

/** 給与明細書(A4縦)の中身。画面には出さず、PDFキャプチャ専用 */
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
