"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PdfPreviewDialog } from "@/components/PdfPreviewDialog";
import { captureSheetToPdfBlob } from "@/lib/pdf-capture";
import { formatMinutes } from "@/lib/period";
import type { PayslipIssuer } from "@/lib/payslip-issuer";
import { PAYSLIP_SHEET_CSS } from "@/lib/payslip-sheet-css";
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
 * 従業員1人分の給与明細を、プレビュー(PdfPreviewDialog)経由で
 * ダウンロード/共有するボタン(給与明細画面の各行の右端)。
 *
 * キャプチャ対象の明細書は、押したときだけ**原寸(210mm)のまま画面外**に描く。
 * 押すまでDOMを作らないので、従業員が何人いても通常時の画面は重くならない。
 */
export function PayslipPdfButton({
  data,
  issuer,
}: {
  data: PayslipPdfData;
  issuer: PayslipIssuer;
}) {
  const [open, setOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

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

      {open &&
        createPortal(
          <>
            {/* ⚠️ 明細書のCSSはここで**インラインの <style> として**入れる。
                html2canvas はクローンした文書に描き直すため、Tailwind のような外部
                スタイルシート頼みだとクローン側でCSSが当たらない環境がある
                (実際に発生。payslip-sheet-css.ts 参照)。インラインなら確実に当たる。 */}
            <style>{PAYSLIP_SHEET_CSS}</style>
            {/* キャプチャ対象。画面外に原寸のまま置く。
                Tailwind の色(oklch)を周りに持ち込まないよう、ダイアログの中には入れない */}
            <div ref={captureRef} aria-hidden="true" className="pslip-capture">
              <PayslipSheet data={data} issuer={issuer} />
            </div>
          </>,
          document.body
        )}

      {open && (
        <PdfPreviewDialog
          title={`${data.name} さんの給与明細`}
          subtitle={data.periodLabel}
          filename={`給与明細_${data.periodKey}_${data.name}.pdf`}
          onClose={() => setOpen(false)}
          make={async () => {
            const el = captureRef.current;
            if (!el) throw new Error("出力対象が見つかりません");
            // 印の画像(data URL)が描画し終わる前に撮ると印が抜けるので、先に読み込みを待つ
            await Promise.all(
              Array.from(el.querySelectorAll("img")).map((img) =>
                img.decode().catch(() => undefined)
              )
            );
            return captureSheetToPdfBlob(el);
          }}
        />
      )}
    </>
  );
}

/** 給与明細書(A4縦)の中身。プレビューとPDFキャプチャの両方で同じものを使う。
 *  ⚠️ スタイルは Tailwind ではなく PAYSLIP_SHEET_CSS の `pslip-*` クラスだけで当てること
 *  (理由は payslip-sheet-css.ts の先頭コメント)。 */
function PayslipSheet({
  data,
  issuer,
}: {
  data: PayslipPdfData;
  issuer: PayslipIssuer;
}) {
  const r = data.result;

  return (
    <div className="pslip-sheet">
      {/* 見出しと支払元。支払元(2行)と印は要望どおり右上に置く */}
      <div className="pslip-head">
        <div>
          <h1 className="pslip-title">給与明細書</h1>
          <p className="pslip-period">{data.periodLabel}</p>
        </div>
        <div className="pslip-issuer">
          <div className="pslip-issuer-lines">
            <div className="pslip-issuer-line1">{issuer.line1}</div>
            <div>{issuer.line2}</div>
          </div>
          {issuer.sealDataUrl && (
            // 印。data URL なので外部読み込み(CORS)は発生しない。
            // 寸法は設定画面で選んだ mm をそのまま指定する(16.5mm=認印 / 18mm=社印)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={issuer.sealDataUrl}
              alt="印"
              className="pslip-seal"
              style={{
                width: `${issuer.sealSizeMm}mm`,
                height: `${issuer.sealSizeMm}mm`,
              }}
            />
          )}
        </div>
      </div>

      <div className="pslip-to">
        <div className="pslip-to-name">{data.name} 様</div>
        <div className="pslip-to-sub">
          対象期間 {slash(data.start)} 〜 {slash(data.end)}　／　支払日{" "}
          {slash(data.paymentDate)}
        </div>
        {data.draft && (
          <div className="pslip-draft">
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

      <div className="pslip-total">
        <span className="pslip-total-label">差引支給額</span>
        <span className="pslip-total-value">{yen(r.net_pay)}</span>
      </div>

      <p className="pslip-note">* 交通費は課税対象外です。</p>
    </div>
  );
}

function SheetSection({ title }: { title: string }) {
  return <div className="pslip-section">{title}</div>;
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
    <div className={`pslip-row${bold ? " pslip-row--bold" : ""}`}>
      <span className="pslip-row-label">{label}</span>
      <span className="pslip-row-value">{value}</span>
    </div>
  );
}
