/**
 * 国税庁「給与所得の源泉徴収税額表（月額表）」のExcelファイル(.xls/.xlsx)を読み取り、
 * `importTaxTable`(admin/settings/actions.ts)が受け付けるCSV形式(以上,未満,甲0〜甲7,乙)
 * に変換する。ブラウザ側(クライアントコンポーネント)から動的importして使う想定
 * (xlsxライブラリをこの画面でしか使わないバンドルに閉じ込めるため)。
 *
 * 2026-08-21、幸田さんの源泉所得税が¥0になっていたバグの原因究明の過程で、手作業の
 * コピペ取り込みでは列・行の選択ミスが起きうることが判明したため、実際にオーナーが
 * 使っているファイル(令和8年分)を検証用に読み込み、DBの既存データ(232行)と1件残らず
 * 一致することを確認した上でこのロジックを実装している。
 *
 * ファイルの構造(検証済み):
 *   - 1行目付近に「給与所得の源泉徴収税額表（令和８年分）」のようなタイトル → 対象年を抽出
 *   - 見出し行の後、「(最小額)円未満 → 甲欄0円・乙欄は3.063%」という文言だけの変則行がある
 *     (数値ではなく文言のため、通常の帯としては取り込めない。取り込まなくても
 *     `lib/payroll.ts`のcomputeIncomeTax()側でこの帯は自動的に正しく計算されるため問題ない)
 *   - その後、「以上,未満,甲0〜甲7,乙」がすべて数値の行が並ぶ(間に空行を挟むことがある)
 *   - ある金額(令和8年分は¥740,000)を境に、乙欄が具体的な数値ではなく税率の計算式(文言)に
 *     切り替わる(超高額所得者向け)。このアプリの時給制アルバイトでは到達しない額のため、
 *     単純な帯形式が終わる時点で読み取りを打ち切ってよい。
 */

import * as XLSX from "xlsx";

export type TaxTableExcelResult = {
  /** 抽出できた場合はタイトル行から読み取った西暦年(読み取れなければ null) */
  year: number | null;
  /** importTaxTable にそのまま渡せるCSVテキスト(1行1区分、以上,未満,甲0〜甲7,乙) */
  csv: string;
  /** 抽出できた区分数 */
  count: number;
  minAmount: number;
  maxAmount: number;
};

/** 全角数字を半角に変換する(国税庁の書式は見出し・タイトルが全角数字のことがあるため) */
function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

/**
 * セルの内容を厳密な整数として解釈する。桁区切りカンマ・末尾の「円」は除去するが、
 * それ以外の文字(「円未満」「を超え」などの説明文言)が混じっていれば数値とはみなさない
 * (取り込み対象外の行を安全にスキップするための厳格な判定)。
 */
function parseStrictNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = toHalfWidthDigits(String(raw)).trim();
  if (s === "") return null;
  const cleaned = s.replace(/,/g, "").replace(/円$/, "");
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** シート内の先頭付近のテキストから「令和N年」を探し、西暦年に変換する */
function findYear(rows: unknown[][]): number | null {
  for (const row of rows.slice(0, 10)) {
    const text = toHalfWidthDigits(row.map((c) => String(c ?? "")).join(""));
    const reiwa = text.match(/令和\s*(\d+)\s*年/);
    if (reiwa) return Number(reiwa[1]) + 2018; // 令和1年 = 2019年
    const seireki = text.match(/(20\d{2})\s*年/);
    if (seireki) return Number(seireki[1]);
  }
  return null;
}

export function parseTaxTableExcel(buffer: ArrayBuffer): TaxTableExcelResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => n.includes("月額表")) ?? wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("シートが見つかりません。ファイルが破損していないか確認してください。");
  }
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
  });

  const year = findYear(rows);

  const lines: string[] = [];
  let minAmount = Infinity;
  let maxAmount = 0;

  for (const row of rows) {
    const min = parseStrictNumber(row[1]);
    if (min === null) continue; // 見出し・空行・注記行はスキップ

    const max = parseStrictNumber(row[2]);
    const kou = [3, 4, 5, 6, 7, 8, 9, 10].map((i) => parseStrictNumber(row[i]));
    const otsu = parseStrictNumber(row[11]);

    if (max !== null && otsu !== null) {
      // 通常の2値帯(以上・未満とも数値、乙欄も数値)
      lines.push([min, max, ...kou, otsu].map((v) => v ?? "").join(","));
      minAmount = Math.min(minAmount, min);
      maxAmount = Math.max(maxAmount, max);
      continue;
    }

    if (max === null && otsu !== null) {
      // 未満が空だが乙欄は数値 = 単純な帯表(以上/未満)形式の最終行。
      // これ以降は高額所得者向けの税率計算式に切り替わるためここで打ち切る。
      lines.push([min, "", ...kou, otsu].map((v) => v ?? "").join(","));
      minAmount = Math.min(minAmount, min);
      maxAmount = Math.max(maxAmount, min);
      break;
    }

    // それ以外(冒頭の「(最小額)円未満」の変則行など)はスキップして次の行へ
  }

  if (lines.length === 0) {
    throw new Error(
      "税額表のデータ行が見つかりませんでした。ファイルの形式が想定と異なる可能性があります。"
    );
  }

  return {
    year,
    csv: lines.join("\n"),
    count: lines.length,
    minAmount,
    maxAmount,
  };
}
