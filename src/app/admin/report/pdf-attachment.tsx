import { PdfReportTable } from "./PdfReportTable";
import { renderAndCapturePdfBase64 } from "@/lib/pdf-capture";
import type { PreviewRows } from "./actions";

export type PdfAttachmentPayload = { base64: string; filename: string };

/**
 * `previewTaxReportRows`/`previewTaxReportTestRows` の結果から、税理士向けメールに
 * 添付するPDFを作る(画面外に `PdfReportTable` を一時マウントしてキャプチャ)。
 * プレビュー取得やPDF作成に失敗した場合は undefined を返す(呼び出し側はCSVのみで
 * 送信を継続できるようにフォールバックする)。
 */
export async function buildTaxReportPdfAttachment(
  preview: PreviewRows,
  filename: string
): Promise<PdfAttachmentPayload | undefined> {
  if (!preview.ok) return undefined;
  try {
    const targetId = `tax-report-pdf-${Math.random().toString(36).slice(2)}`;
    const base64 = await renderAndCapturePdfBase64(
      <PdfReportTable
        id={targetId}
        periodLabel={preview.periodLabel}
        companyName={preview.companyName}
        rows={preview.rows}
      />,
      targetId
    );
    return { base64, filename };
  } catch {
    return undefined;
  }
}
