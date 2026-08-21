"use client";

import { useState, useTransition } from "react";
import { importTaxTable } from "../settings/actions";
import type { ActionResult } from "../employees/actions";

export type TaxTableRow = {
  year: number;
  min_amount: number;
  max_amount: number | null;
  tax_otsu: number;
  tax_kou_0: number | null;
  tax_kou_1: number | null;
  tax_kou_2: number | null;
  tax_kou_3: number | null;
  tax_kou_4: number | null;
  tax_kou_5: number | null;
  tax_kou_6: number | null;
  tax_kou_7: number | null;
  created_at: string;
};

/** ISO日時を日本時間の「yyyy/M/D HH:MM」表記にする */
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function yen(n: number | null) {
  return n === null || n === undefined ? "—" : n.toLocaleString();
}

function UploadIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

type ExcelPreview = {
  year: number | null;
  csv: string;
  count: number;
  minAmount: number;
  maxAmount: number;
};

export function TaxTableForm({ rows }: { rows: TaxTableRow[] }) {
  // 年ごとに区分数・取り込み日時(最新)を集計(登録済み表示用)
  const yearCounts = new Map<number, number>();
  const yearImportedAt = new Map<number, string>();
  for (const r of rows) {
    yearCounts.set(r.year, (yearCounts.get(r.year) ?? 0) + 1);
    const prev = yearImportedAt.get(r.year);
    if (!prev || r.created_at > prev) yearImportedAt.set(r.year, r.created_at);
  }
  const years = [...yearCounts.keys()].sort((a, b) => b - a);

  const [viewYear, setViewYear] = useState<number | null>(years[0] ?? null);
  const shownRows = rows.filter((r) => r.year === viewYear);
  const viewImportedAt = viewYear ? yearImportedAt.get(viewYear) : undefined;

  // ---- Excelアップロード(主経路) ----
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [previewYear, setPreviewYear] = useState<number | "">("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<ActionResult | null>(null);
  const [uploadPending, startUploadTransition] = useTransition();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを選び直しても再度読み取れるようにする
    if (!file) return;
    setParseError(null);
    setUploadResult(null);
    setPreview(null);
    setParsing(true);
    try {
      const { parseTaxTableExcel } = await import("@/lib/tax-table-excel");
      const buffer = await file.arrayBuffer();
      const parsed = parseTaxTableExcel(buffer);
      setPreview(parsed);
      setPreviewYear(parsed.year ?? new Date().getFullYear());
    } catch (err) {
      setParseError(
        "ファイルの読み取りに失敗しました: " +
          (err instanceof Error ? err.message : String(err)) +
          "。下の「Excelから読み取れない場合」から手動で貼り付けることもできます。"
      );
    } finally {
      setParsing(false);
    }
  }

  function submitPreview() {
    if (!preview || previewYear === "") return;
    startUploadTransition(async () => {
      const fd = new FormData();
      fd.set("year", String(previewYear));
      fd.set("csv", preview.csv);
      try {
        const res = await importTaxTable(fd);
        setUploadResult(res);
        if (res.ok) setPreview(null);
      } catch (e) {
        setUploadResult({
          ok: false,
          message:
            "取り込みに失敗しました: " +
            (e instanceof Error ? e.message : String(e)),
        });
      }
    });
  }

  // ---- 手動貼り付け(Excelが読み取れない場合の予備経路。既定は折りたたみ) ----
  const [manualResult, setManualResult] = useState<ActionResult | null>(null);
  const [manualPending, startManualTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        源泉徴収税額表(月額表)
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        課税対象額が月88,000円以上の人がいる場合に必要です(88,000円未満は自動計算:
        乙欄3.063%・甲欄0円)。国税庁の月額表をダウンロードし、下から取り込んでください。
      </p>

      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm">
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(
            "源泉徴収税額表(月額表)"
          )}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
        >
          「源泉徴収税額表(月額表)」をWeb検索する
          <span aria-hidden>↗</span>
        </a>
        <p className="mt-2 text-xs text-gray-600">
          検索結果から国税庁の対象年分の
          <strong>「給与所得の源泉徴収税額表（月額表）」</strong>
          のExcel(.xls/.xlsx)をダウンロードし、下の「Excelファイルを選択」でそのまま
          取り込んでください。
        </p>
        <p className="mt-2 text-xs text-gray-400">
          ※ 国税庁は月額表をExcel/PDFで公開しています。公開様式・ページ構成は年により
          変わることがあるため、うまく読み取れない場合は下の手動貼り付けをご利用ください。
        </p>
      </div>

      {/* 主経路: Excelファイルのアップロード */}
      <div className="mt-3 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/30 p-4">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <UploadIcon className="h-5 w-5" />
          Excelファイルを選択
          <input
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={parsing}
            onChange={handleFile}
            className="hidden"
          />
        </label>
        {parsing && (
          <p className="mt-2 text-sm text-gray-500">読み取り中...</p>
        )}
        {parseError && (
          <p className="mt-2 text-sm text-red-600">{parseError}</p>
        )}

        {preview && (
          <div className="mt-3 rounded-lg border border-green-200 bg-white p-3">
            <p className="text-sm font-medium text-green-800">
              ファイルから{preview.count}区分を読み取りました
              (¥{preview.minAmount.toLocaleString()}〜¥
              {preview.maxAmount.toLocaleString()})
            </p>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-sm font-medium">対象年</label>
              <input
                type="number"
                value={previewYear}
                onChange={(e) =>
                  setPreviewYear(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              対象年を確認し、問題なければ登録してください(同年度は入れ替えます)。
            </p>
            <button
              type="button"
              disabled={uploadPending || previewYear === ""}
              onClick={submitPreview}
              className="mt-3 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploadPending ? "取り込み中..." : "この内容で取り込む"}
            </button>
          </div>
        )}
        {uploadResult && (
          <p
            className={`mt-2 text-sm ${uploadResult.ok ? "text-green-700" : "text-red-600"}`}
          >
            {uploadResult.message}
          </p>
        )}
      </div>

      {/* 予備経路: 手動貼り付け(既定は折りたたみ) */}
      <details className="mt-3 rounded-lg border border-gray-200">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          Excelから読み取れない場合(手動で貼り付ける)
        </summary>
        <div className="space-y-3 border-t border-gray-100 p-3">
          <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600">
            形式: 以上,未満,甲0,甲1,甲2,甲3,甲4,甲5,甲6,甲7,乙
            <br />
            例: 88000,89000,130,0,0,0,0,0,0,0,3200
            <br />
            (Excelから「その月の社会保険料等控除後の給与等の金額」の“以上・未満”、
            甲欄(扶養0〜7人)、乙欄の各列をコピーしてそのまま貼り付け可。桁区切りカンマも
            自動で除去します。甲欄の途中列は空欄可、乙欄は必須。最終行の「未満」は空欄で
            上限なし。乙欄のみなら「以上,未満,乙」の3列でも可)
          </div>
          <form
            action={(fd) =>
              startManualTransition(async () => {
                try {
                  setManualResult(await importTaxTable(fd));
                } catch (e) {
                  setManualResult({
                    ok: false,
                    message:
                      "取り込みに失敗しました: " +
                      (e instanceof Error ? e.message : String(e)),
                  });
                }
              })
            }
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">対象年</label>
              <input
                name="year"
                type="number"
                required
                defaultValue={new Date().getFullYear()}
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <textarea
              name="csv"
              rows={6}
              placeholder={
                "88000,89000,130,0,0,0,0,0,0,0,3200\n89000,90000,180,0,0,0,0,0,0,0,3200"
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {manualResult && (
              <p
                className={`text-sm ${manualResult.ok ? "text-green-700" : "text-red-600"}`}
              >
                {manualResult.message}
              </p>
            )}
            <button
              disabled={manualPending}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {manualPending ? "取り込み中..." : "取り込む(同年度は入れ替え)"}
            </button>
          </form>
        </div>
      </details>

      {/* 取り込み済みデータの表表示 */}
      {years.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">登録済みデータ</h3>
            <select
              value={viewYear ?? ""}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              {shownRows.length}区分
            </span>
            {viewImportedAt && (
              <span className="text-xs text-gray-400">
                / 取り込み日時 {formatDateTime(viewImportedAt)}
              </span>
            )}
          </div>
          <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 text-right">以上</th>
                  <th className="px-2 py-1.5 text-right">未満</th>
                  <th className="px-2 py-1.5 text-right">甲0</th>
                  <th className="px-2 py-1.5 text-right">甲1</th>
                  <th className="px-2 py-1.5 text-right">甲2</th>
                  <th className="px-2 py-1.5 text-right">甲3</th>
                  <th className="px-2 py-1.5 text-right">甲4</th>
                  <th className="px-2 py-1.5 text-right">甲5</th>
                  <th className="px-2 py-1.5 text-right">甲6</th>
                  <th className="px-2 py-1.5 text-right">甲7</th>
                  <th className="px-2 py-1.5 text-right">乙</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1">{yen(r.min_amount)}</td>
                    <td className="px-2 py-1 text-gray-500">
                      {r.max_amount === null ? "以上" : yen(r.max_amount)}
                    </td>
                    <td className="px-2 py-1">{yen(r.tax_kou_0)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_1)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_2)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_3)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_4)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_5)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_6)}</td>
                    <td className="px-2 py-1">{yen(r.tax_kou_7)}</td>
                    <td className="px-2 py-1 font-medium">{yen(r.tax_otsu)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
