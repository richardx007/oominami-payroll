/**
 * 給与明細書(PDF)のスタイル。**Tailwind を使わず、ここに書いた素のCSSだけで組む。**
 *
 * ⚠️ これが要点。html2canvas は取り込み対象をクローンした文書に描き直すため、
 * Tailwind のような**外部スタイルシート頼みだと、クローン側でCSSが当たらない環境がある**
 * （2026-09-11、オーナー環境で実際に発生。フォント・枠線・右揃え・印のサイズ指定がすべて消え、
 * ブラウザ既定のスタイルだけのPDFになった。ヘッドレスChromiumでは再現しなかったため
 * ブラウザ差がある）。この文字列を取り込み対象のすぐ隣に `<style>` として置けば、
 * クローンにもそのまま複製されるので**ネットワーク取得なしで確実に当たる**。
 * biz-management の請求書（`app/src/components/DocActions.tsx` の `DOC_CSS`）と同じ考え方。
 *
 * ⚠️ 色は**16進数だけ**で書くこと。Tailwind v4 の `oklch()` が混ざると本家 html2canvas が
 * 「unsupported color function」で失敗する（`html2canvas-pro` は逆に mm 指定のレイアウトを
 * 崩した実績があるため、この帳票は本家を使う。§20・clock.tsx のコメント参照）。
 *
 * ⚠️ 寸法は**mm で書く**こと。シートを 210mm 幅で作り、PDFには用紙いっぱい(0,0,210,…)で
 * 貼るため、ここに書いた mm がそのまま印刷寸法になる（印の 16.5mm / 18mm 指定もこれで効く）。
 */
export const PAYSLIP_SHEET_CSS = `
.pslip-sheet{
  box-sizing:border-box; width:210mm; min-height:297mm; padding:14mm 24mm 12mm;
  background:#ffffff; color:#111827;
  font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;
  font-size:3.4mm; line-height:1.7;
}
.pslip-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:8mm; }
.pslip-title{ margin:0; font-size:7mm; font-weight:700; letter-spacing:0.1em; }
.pslip-period{ margin:1.5mm 0 0; font-size:4.4mm; font-weight:700; color:#374151; }
/* 見出しより1行ぶん下げて置く(オーナー指定) */
.pslip-issuer{ display:flex; align-items:flex-start; gap:3mm; margin-top:6mm; }
.pslip-issuer-lines{ text-align:right; font-size:3.6mm; line-height:1.6; white-space:pre-line; }
.pslip-issuer-line1{ font-size:4.2mm; font-weight:700; }
/* 印の寸法は要素側の style で mm 指定する(設定画面で 16.5mm / 18mm を選ぶ) */
.pslip-seal{ object-fit:contain; flex:0 0 auto; }
.pslip-to{ margin-top:8mm; padding-bottom:3mm; border-bottom:0.3mm solid #9ca3af; }
.pslip-to-name{ font-size:4.6mm; font-weight:700; }
.pslip-to-sub{ margin-top:1mm; font-size:3mm; color:#4b5563; }
.pslip-draft{ margin-top:1mm; font-size:3mm; color:#b45309; }
.pslip-section{
  margin-top:6mm; padding-bottom:1mm; border-bottom:0.3mm solid #9ca3af;
  font-size:3mm; font-weight:700; letter-spacing:0.15em; color:#4b5563;
}
.pslip-row{
  display:flex; align-items:baseline; justify-content:space-between; gap:6mm;
  padding:1.4mm 0; border-bottom:0.2mm solid #e5e7eb;
}
.pslip-row--bold{ font-weight:700; }
.pslip-row-label{ color:#374151; }
.pslip-row-value{ font-variant-numeric:tabular-nums; white-space:nowrap; }
.pslip-total{
  display:flex; align-items:baseline; justify-content:space-between;
  margin-top:5mm; padding-top:3mm; border-top:0.6mm solid #1f2937;
}
.pslip-total-label{ font-size:4.2mm; font-weight:700; }
.pslip-total-value{ font-size:7mm; font-weight:700; font-variant-numeric:tabular-nums; }
.pslip-note{ margin-top:8mm; font-size:2.8mm; color:#6b7280; }

/* PDFに撮るノード。画面には見せず、原寸のまま画面外に置く
   (display:none だとレイアウトされずキャプチャできない) */
.pslip-capture{
  position:fixed; top:0; left:-10000px; z-index:-1;
  pointer-events:none; background:#ffffff;
}
`;
