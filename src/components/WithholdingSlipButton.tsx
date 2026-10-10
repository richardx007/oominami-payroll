"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PdfPreviewDialog } from "@/components/PdfPreviewDialog";
import { captureSheetToPdfBlob } from "@/lib/pdf-capture";
import {
  reiwaYear,
  toJapaneseDate,
  type WithholdingSlipTotals,
} from "@/lib/withholding-slip";

/** 源泉徴収票1枚分のデータ(サーバーコンポーネントで組み立てて渡す) */
export type WithholdingSlipData = {
  totals: WithholdingSlipTotals;
  /** 年の途中(まだ年が終わっていない)なら作成日 "YYYY-MM-DD"。正式な源泉徴収票ではない旨を出す */
  inProgressAsOf: string | null;
  name: string;
  furigana: string;
  postalCode: string;
  address: string;
  /** 生年月日 "YYYY-MM-DD"(未入力は空。システム管理者には伏せ字 "****-**-**") */
  birthDate: string;
  change: { kind: "就職" | "退職"; date: string } | null;
  employer: { name: string; address: string; phone: string };
};

/**
 * 給与所得の源泉徴収票(受給者交付用)をPDFで出すボタン。給与明細PDFと同じく、
 * 原寸(210mm)のシートを画面外に描いて html2canvas で撮る(captureSheetToPdfBlob)。
 * ⚠️ スタイルは下の WITHHOLDING_CSS(16進数の色・mm 指定)だけで当てる。理由は payslip-sheet-css.ts と同じ。
 */
export function WithholdingSlipButton({
  data,
  label,
}: {
  data: WithholdingSlipData;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const y = data.totals.year;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
      >
        {label}
      </button>

      {open &&
        createPortal(
          <>
            <style>{WITHHOLDING_CSS}</style>
            <div ref={captureRef} aria-hidden="true" className="wh-capture">
              <WithholdingSheet data={data} />
            </div>
          </>,
          document.body
        )}

      {open && (
        <PdfPreviewDialog
          title="源泉徴収票"
          subtitle={`${y}年分`}
          filename={`源泉徴収票_${y}_${data.name}.pdf`}
          onClose={() => setOpen(false)}
          make={async () => {
            const el = captureRef.current;
            if (!el) throw new Error("出力対象が見つかりません");
            return captureSheetToPdfBlob(el);
          }}
        />
      )}
    </>
  );
}

const yen = (n: number) => n.toLocaleString();

function JpDate({ iso }: { iso: string | null }) {
  const d = iso ? toJapaneseDate(iso) : null;
  if (!d) return <span className="wh-blank">年　　月　　日</span>;
  return (
    <span>
      {d.era} {d.year}年 {d.month}月 {d.day}日
    </span>
  );
}

/** 受給者区分(未成年者・乙欄など)。見出しの行と ○ の行の2段の小さな表にする */
function Checks({ items }: { items: { label: string; on: boolean }[] }) {
  return (
    <table className="wh-inner">
      <tbody>
        <tr>
          {items.map((i) => (
            <th key={i.label}>{i.label}</th>
          ))}
        </tr>
        <tr>
          {items.map((i) => (
            <td key={i.label}>{i.on ? "○" : ""}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function WithholdingSheet({ data }: { data: WithholdingSlipData }) {
  const t = data.totals;
  const remarks: string[] = [];
  if (t.kou) remarks.push("年末調整未済");
  if (data.inProgressAsOf) {
    remarks.push(`${data.inProgressAsOf.replaceAll("-", "/")} 時点の途中経過`);
  }

  return (
    <div className="pslip-sheet wh-sheet">
      <div className="wh-head">
        <h1 className="wh-title">
          令和{reiwaYear(t.year)}年分　給与所得の源泉徴収票
        </h1>
        <div className="wh-copy">(受給者交付用)</div>
      </div>
      {data.inProgressAsOf && (
        <div className="wh-progress">
          年の途中({data.inProgressAsOf.replaceAll("-", "/")} 時点)の集計です。正式な源泉徴収票は年が明けてからお渡しします。
        </div>
      )}

      <table className="wh-table">
        <colgroup>
          <col style={{ width: "20mm" }} />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <tbody>
          {/* 支払を受ける者 */}
          <tr>
            <th rowSpan={2} className="wh-vertical">
              支払を受ける者
            </th>
            <td colSpan={2} rowSpan={2} className="wh-addr">
              <div className="wh-caption">住所又は居所</div>
              <div className="wh-postal">{data.postalCode ? `〒${data.postalCode}` : ""}</div>
              <div className="wh-value-l">{data.address || <span className="wh-missing">(未入力)</span>}</div>
            </td>
            <td colSpan={2}>
              <div className="wh-caption">(受給者番号)</div>
              <div className="wh-value-l">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <div className="wh-caption">(フリガナ) {data.furigana}</div>
              <div className="wh-caption">氏名</div>
              <div className="wh-name">{data.name}</div>
            </td>
          </tr>

          {/* 金額 */}
          <tr className="wh-amount-head">
            <th>種別</th>
            <th>支払金額</th>
            <th>
              給与所得控除後の金額
              <br />
              (調整控除後)
            </th>
            <th>所得控除の額の合計額</th>
            <th>源泉徴収税額</th>
          </tr>
          <tr className="wh-amount">
            <td className="wh-center">給料・賃金</td>
            <td>
              <span className="wh-unit">円</span>
              {yen(t.paymentTotal)}
            </td>
            <td>
              <span className="wh-unit">円</span>
            </td>
            <td>
              <span className="wh-unit">円</span>
            </td>
            <td>
              <span className="wh-unit">円</span>
              {yen(t.taxTotal)}
            </td>
          </tr>

          {/* 控除の内訳(年末調整をしないので空欄) */}
          <tr className="wh-amount-head">
            <th colSpan={2}>(源泉)控除対象配偶者の有無等・配偶者(特別)控除の額</th>
            <th>控除対象扶養親族の数</th>
            <th>16歳未満扶養親族の数</th>
            <th>障害者の数(本人を除く)</th>
          </tr>
          <tr className="wh-amount wh-empty-row">
            <td colSpan={2}></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr className="wh-amount-head">
            <th colSpan={2}>社会保険料等の金額</th>
            <th>生命保険料の控除額</th>
            <th>地震保険料の控除額</th>
            <th>住宅借入金等特別控除の額</th>
          </tr>
          <tr className="wh-amount wh-empty-row">
            <td colSpan={2}>
              <span className="wh-unit">円</span>
            </td>
            <td>
              <span className="wh-unit">円</span>
            </td>
            <td>
              <span className="wh-unit">円</span>
            </td>
            <td>
              <span className="wh-unit">円</span>
            </td>
          </tr>

          {/* 摘要 */}
          <tr>
            <th className="wh-vertical">摘要</th>
            <td colSpan={4} className="wh-remarks">
              {remarks.join("　／　")}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 受給者区分・中途就退職・生年月日 */}
      <table className="wh-table wh-table--sub">
        <tbody>
          <tr>
            <td className="wh-checks">
              <Checks
                items={[
                  { label: "未成年者", on: false },
                  { label: "外国人", on: false },
                  { label: "死亡退職", on: false },
                  { label: "災害者", on: false },
                  { label: "乙欄", on: t.otsu },
                  { label: "本人が障害者", on: false },
                  { label: "寡婦", on: false },
                  { label: "ひとり親", on: false },
                  { label: "勤労学生", on: false },
                ]}
              />
            </td>
            <td className="wh-change">
              <div className="wh-caption">中途就・退職</div>
              <div className="wh-change-row">
                <span className={data.change?.kind === "就職" ? "wh-on" : "wh-off"}>就職</span>
                <span className={data.change?.kind === "退職" ? "wh-on" : "wh-off"}>退職</span>
              </div>
              <div className="wh-value-c">
                <JpDate iso={data.change?.date ?? null} />
              </div>
            </td>
            <td className="wh-birth">
              <div className="wh-caption">受給者生年月日</div>
              <div className="wh-value-c">
                {!data.birthDate ? (
                  <span className="wh-missing">(未入力)</span>
                ) : toJapaneseDate(data.birthDate) ? (
                  <JpDate iso={data.birthDate} />
                ) : (
                  // システム管理者には伏せ字("****-**-**")で届く
                  <span>＊＊ ＊＊年 ＊＊月 ＊＊日</span>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 支払者 */}
      <table className="wh-table wh-table--sub">
        <colgroup>
          <col style={{ width: "20mm" }} />
          <col style={{ width: "36mm" }} />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <th rowSpan={2} className="wh-vertical">
              支払者
            </th>
            <th className="wh-left">住所(居所)又は所在地</th>
            <td className="wh-value-l">{data.employer.address}</td>
          </tr>
          <tr>
            <th className="wh-left">氏名又は名称</th>
            <td className="wh-value-l">
              {data.employer.name}
              {data.employer.phone && <span className="wh-phone">(電話) {data.employer.phone}</span>}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="wh-note">
        ※ 交通費(非課税)は支払金額に含めていません。このシステムでは年末調整を行っていないため、
        給与所得控除後の金額・所得控除の額の合計額などは空欄です。
      </p>
    </div>
  );
}

const WITHHOLDING_CSS = `
.wh-capture{ position:fixed; top:0; left:-10000px; z-index:-1; pointer-events:none; background:#ffffff; }
.wh-sheet{
  box-sizing:border-box; width:210mm; min-height:297mm; padding:14mm 12mm 8mm;
  background:#ffffff; color:#111111;
  font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;
  font-size:3.1mm; line-height:1.5;
}
.wh-head{ display:flex; align-items:flex-end; justify-content:center; gap:6mm; margin-bottom:3mm; position:relative; }
.wh-title{ margin:0; font-size:5.6mm; font-weight:700; letter-spacing:0.12em; }
.wh-copy{ position:absolute; right:0; bottom:0.5mm; font-size:3mm; }
.wh-progress{ margin:0 0 3mm; padding:1.5mm 3mm; border:0.3mm solid #b91c1c; color:#b91c1c; font-size:3mm; }
.wh-table{ width:100%; border-collapse:collapse; table-layout:fixed; border:0.5mm solid #111111; }
.wh-table--sub{ margin-top:-0.5mm; }
.wh-table th, .wh-table td{ border:0.25mm solid #111111; padding:1mm 1.5mm; vertical-align:top; }
.wh-table th{ font-weight:400; font-size:2.6mm; text-align:center; vertical-align:middle; background:#f3f4f6; }
.wh-vertical{ writing-mode:vertical-rl; letter-spacing:0.2em; font-size:3mm !important; }
.wh-left{ text-align:left !important; }
.wh-caption{ font-size:2.5mm; color:#374151; }
.wh-postal{ font-size:3.1mm; }
.wh-value-l{ font-size:3.6mm; min-height:5mm; }
.wh-value-c{ font-size:3.3mm; text-align:center; margin-top:1mm; }
.wh-name{ font-size:4.6mm; font-weight:700; letter-spacing:0.1em; }
.wh-addr{ height:22mm; }
.wh-amount td{ height:9mm; text-align:right; vertical-align:bottom; font-size:4mm; font-variant-numeric:tabular-nums; position:relative; }
.wh-amount td.wh-center{ text-align:center; vertical-align:middle; font-size:3mm; white-space:nowrap; }
.wh-unit{ position:absolute; top:0.6mm; right:1.2mm; font-size:2.4mm; color:#374151; }
.wh-empty-row td{ height:7mm; }
.wh-remarks{ height:16mm; font-size:3mm; }
.wh-table td.wh-checks{ padding:0; }
.wh-inner{ width:100%; height:100%; border-collapse:collapse; table-layout:fixed; }
.wh-inner th, .wh-inner td{ border:none; border-right:0.25mm solid #111111; text-align:center; padding:0.6mm 0; }
.wh-inner th:last-child, .wh-inner td:last-child{ border-right:none; }
.wh-inner th{ font-size:2.2mm; height:8mm; border-bottom:0.25mm solid #111111; background:#f3f4f6; }
.wh-inner td{ font-size:4mm; height:8mm; vertical-align:middle; }
.wh-change{ width:46mm; }
.wh-birth{ width:44mm; }
.wh-change-row{ display:flex; gap:4mm; justify-content:center; font-size:3mm; }
.wh-on{ border:0.3mm solid #111111; border-radius:50%; padding:0 1.2mm; }
.wh-off{ padding:0 1.5mm; color:#6b7280; }
.wh-phone{ margin-left:6mm; font-size:3.2mm; }
.wh-missing{ color:#b91c1c; font-size:3mm; }
.wh-blank{ color:#9ca3af; }
.wh-note{ margin:3mm 0 0; font-size:2.6mm; color:#374151; }
`;
