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
 *
 * デザインは「ネイビー・クラシック」（紺 #1e3a5f × 金 #c9a227。2026-10-09 オーナーが3案から選択）。
 * ⚠️ 印刷時のインク節約のため、**広い面のべた塗りはしない**（オーナー指定）。色は線・文字と、
 * ごく薄い背景(#f5f8fc)だけに使う。差引支給額などの強調も塗りつぶしではなく枠線で行う。
 */
export const PAYSLIP_SHEET_CSS = `
.pslip-sheet{
  box-sizing:border-box; width:210mm; min-height:297mm; padding:10mm 24mm 6mm;
  background:#ffffff; color:#111827;
  font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;
  font-size:3.4mm; line-height:1.7;
}
/* 見出し: 上に紺の太線・下に金の細線(帯で塗りつぶさない) */
.pslip-head{
  display:flex; align-items:flex-end; justify-content:space-between; gap:8mm;
  padding:5mm 0 2.5mm; border-top:1.2mm solid #1e3a5f; border-bottom:0.5mm solid #c9a227;
  color:#1e3a5f;
}
.pslip-title-en{ font-size:2.6mm; font-weight:700; letter-spacing:0.4em; color:#c9a227; }
.pslip-title{ margin:0; font-size:7.5mm; font-weight:700; letter-spacing:0.25em; line-height:1.4; }
.pslip-period{ margin:0; font-size:4.6mm; font-weight:700; white-space:nowrap; }
/* 宛名(左)と支払元・印(右)を横に並べる */
.pslip-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:8mm; margin-top:6mm; }
.pslip-issuer{ display:flex; align-items:flex-start; gap:3mm; }
.pslip-issuer-lines{ text-align:right; font-size:3.6mm; line-height:1.6; white-space:pre-line; }
.pslip-issuer-line1{ font-size:4.2mm; font-weight:700; }
/* 印の寸法は要素側の style で mm 指定する(設定画面で 16.5mm / 18mm を選ぶ) */
.pslip-seal{ object-fit:contain; flex:0 0 auto; }
.pslip-to-name{
  display:inline-block; font-size:5mm; font-weight:700; line-height:1.6;
  padding-bottom:1mm; border-bottom:0.4mm solid #1e3a5f;
}
.pslip-to-sub{ margin-top:1.5mm; font-size:3mm; color:#4b5563; }
.pslip-draft{ margin-top:1mm; font-size:3mm; color:#b45309; }
/* 項目見出し: ごく薄い背景+左に紺の目印 */
.pslip-section{
  margin-top:4mm; padding:1mm 3mm; background:#f5f8fc; border-left:1.4mm solid #1e3a5f;
  font-size:3.2mm; font-weight:700; letter-spacing:0.2em; color:#1e3a5f;
}
.pslip-row{
  display:flex; align-items:baseline; justify-content:space-between; gap:6mm;
  padding:1.1mm 3mm; border-bottom:0.2mm solid #e5e7eb; line-height:1.5;
}
.pslip-row--bold{ font-weight:700; border-bottom:0.4mm solid #1e3a5f; }
.pslip-row-label{ color:#374151; }
.pslip-row--bold .pslip-row-label{ color:#111827; }
.pslip-row-value{ font-variant-numeric:tabular-nums; white-space:nowrap; }
.pslip-row-value--minus{ color:#b42318; }
/* 差引支給額などの合計: 塗りつぶさず紺の枠線で強調 */
.pslip-total{
  display:flex; align-items:baseline; justify-content:space-between; gap:6mm;
  margin-top:4mm; padding:2.5mm 5mm; border:0.6mm solid #1e3a5f; border-radius:1.5mm;
  color:#1e3a5f; font-weight:700;
}
/* お振込額(差引支給額+立替精算)は金の枠線で区別する */
.pslip-total--sub{ margin-top:2.5mm; padding:2.5mm 5mm; border-width:0.5mm; border-color:#c9a227; }
.pslip-total-label{ font-size:4.2mm; letter-spacing:0.15em; }
/* 金額は氏名(.pslip-to-name)と同じ大きさに揃える(2026-09-11、オーナー指定) */
.pslip-total-value{ font-size:5mm; font-variant-numeric:tabular-nums; white-space:nowrap; }
.pslip-note{ margin-top:5mm; font-size:2.8mm; color:#6b7280; }

/* PDFに撮るノード。画面には見せず、原寸のまま画面外に置く
   (display:none だとレイアウトされずキャプチャできない) */
.pslip-capture{
  position:fixed; top:0; left:-10000px; z-index:-1;
  pointer-events:none; background:#ffffff;
}
`;
