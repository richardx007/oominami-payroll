/**
 * 給与明細PDFの「支払元」表示(2行)と「印」の画像。
 * 管理者の設定画面(/admin/settings の「給与明細PDF」)で登録し、
 * 給与明細画面(/admin/close)の従業員別PDFの右上に印字する。
 *
 * 印の画像は Storage ではなく app_settings に data URL のまま保持する。
 * PDFは html2canvas で DOM をそのまま画像化して作るため、外部URLの画像だと
 * CORS・署名付きURLの期限といった失敗要因が増える。data URL なら
 * サーバーコンポーネントが渡した文字列をそのまま <img> に載せるだけで確実に写る
 * (印は小さな画像なので、サイズ上限 SEAL_MAX_SIZE の範囲で十分収まる)。
 */

export const PAYSLIP_ISSUER_KEYS = [
  "payslip_payer_line1",
  "payslip_payer_line2",
  "payslip_seal_data_url",
  "payslip_seal_filename",
  "payslip_seal_size_mm",
] as const;

/** 印の画像として受け付ける種別・サイズ上限(data URL にすると約1.34倍に膨らむ) */
export const SEAL_ALLOWED_TYPES = ["image/png", "image/jpeg"];

/** 印の印字サイズ(mm)。実際のはんこの規格に合わせた2択 */
export const SEAL_SIZES = [
  { mm: 16.5, label: "16.5mm(認印)" },
  { mm: 18, label: "18mm(社印)" },
] as const;
export const DEFAULT_SEAL_SIZE_MM = 16.5;
export const SEAL_MAX_SIZE = 150 * 1024; // 150KB(印は小さな画像。設定画面・給与明細画面の
// 転送量に直接乗るため、余裕を見つつ小さめに抑える)

export type PayslipIssuer = {
  /** 支払元1行目(会社名など)。未設定なら空文字 */
  line1: string;
  /** 支払元2行目(住所・代表者名など)。未設定なら空文字 */
  line2: string;
  /** 印の画像(data URL)。未登録なら null */
  sealDataUrl: string | null;
  /** 印としてアップロードされた元のファイル名(設定画面の表示用)。未登録なら null */
  sealFilename: string | null;
  /** PDFに印字する印の一辺(mm)。16.5=認印 / 18=社印 */
  sealSizeMm: number;
};

/** app_settings の (key, value) 行から支払元設定を取り出す */
export function parsePayslipIssuer(
  rows: { key: string; value: string | null }[]
): PayslipIssuer {
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  return {
    line1: map.get("payslip_payer_line1") ?? "",
    line2: map.get("payslip_payer_line2") ?? "",
    sealDataUrl: map.get("payslip_seal_data_url") || null,
    sealFilename: map.get("payslip_seal_filename") || null,
    sealSizeMm: normalizeSealSizeMm(map.get("payslip_seal_size_mm")),
  };
}

/** 保存値を許可された印サイズに丸める(未設定・不正値は既定の16.5mm) */
export function normalizeSealSizeMm(value: string | undefined | null): number {
  const n = Number(value);
  return SEAL_SIZES.some((s) => s.mm === n) ? n : DEFAULT_SEAL_SIZE_MM;
}
