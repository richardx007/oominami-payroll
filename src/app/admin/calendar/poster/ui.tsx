"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PdfPreviewDialog } from "@/components/PdfPreviewDialog";
import { capturePosterImage, capturePosterPdf } from "@/lib/poster-export";
import {
  addMonthsYm,
  EVENT_COLORS,
  type BusinessDayRow,
  type CalendarEventRow,
  type EventTypeRow,
} from "@/lib/business-calendar-view";
import { PosterCalendar } from "./PosterCalendar";
import { seasonOf, SceneDefs } from "./seasons";

const STORE_NAME = "オオミナミ";
// A4（96dpi換算）のCSSピクセル。画面プレビューの縮尺計算に使う（シート自体は mm 指定）
const A4_W = 793.7;
const A4_H = 1122.5;

export function PosterView({
  ym,
  days,
  events,
  types,
  holidays,
  footnotes,
}: {
  ym: string;
  days: BusinessDayRow[];
  events: CalendarEventRow[];
  types: EventTypeRow[];
  holidays: Record<string, string>;
  /** 月の注釈（空の行は除いたもの。2行まで） */
  footnotes: string[];
}) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [dialog, setDialog] = useState<null | "pdf" | "img">(null);

  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const season = seasonOf(month);
  const fileBase = `オオミナミ営業カレンダー_${ym}`;
  const legendTypes = [...types].sort((a, b) => a.sort_order - b.sort_order);

  // 画面プレビューは表示枠の幅に合わせて縮小（書き出し時は transform を外して等倍で撮る）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 16) / A4_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (m: string) => router.push(`/admin/calendar/poster?ym=${m}`);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div>
        <Link href={`/admin/calendar?ym=${ym}`} className="text-sm text-blue-700 hover:underline">
          ← 営業カレンダー
        </Link>
        <h1 className="mt-1 text-xl font-bold">ポスター（A4）</h1>
        <p className="mt-1 text-sm text-gray-500">
          掲示用のA4ポスターをPDFまたは画像で出力します。公開しているイベントだけが載ります。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => go(addMonthsYm(ym, -1))}
          aria-label="前月"
          className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
        >
          ＜
        </button>
        <span className="text-lg font-extrabold tracking-tight text-blue-800">
          {year}年{month}月
        </span>
        <button
          onClick={() => go(addMonthsYm(ym, 1))}
          aria-label="翌月"
          className="shrink-0 rounded-lg px-2 py-1 text-xl font-bold text-gray-600 hover:bg-gray-100"
        >
          ＞
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setDialog("pdf")}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700"
          >
            PDF
          </button>
          <button
            onClick={() => setDialog("img")}
            className="rounded-lg border border-blue-600 bg-white px-5 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"
          >
            画像
          </button>
        </div>
      </div>
      {days.filter((d) => d.date.startsWith(ym)).length === 0 && (
        <p className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">
          この月の営業カレンダーはまだ作成されていないため、営業時間は載りません。
        </p>
      )}

      {/* A4シート（台紙の上に縮小表示） */}
      <div ref={stageRef} className="overflow-hidden rounded-xl bg-[#52555c] p-2">
        <div className="mx-auto" style={{ width: A4_W * scale, height: A4_H * scale }}>
          <div
            ref={sheetRef}
            className="relative flex flex-col overflow-hidden bg-white shadow-2xl"
            style={{
              width: "210mm",
              height: "297mm",
              background: `linear-gradient(180deg, ${season.page.from}, ${season.page.to})`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              printColorAdjust: "exact",
              WebkitPrintColorAdjust: "exact",
            }}
          >
            {/* ヘッダー（風物詩シーン＋タイトル） */}
            <header className="relative h-[54mm] shrink-0 overflow-hidden">
              <svg viewBox="0 0 900 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
                <SceneDefs />
                <season.Scene />
              </svg>
              <div className="relative flex h-full flex-col justify-end px-[13mm] pb-[5mm]">
                <div className="flex items-end justify-between gap-[6mm]">
                  <div style={{ textShadow: "0 1px 3px rgba(255,255,255,0.65)" }}>
                    <p className="mb-[0.5mm] text-[27pt] font-black leading-[1.15] tracking-[0.1em]" style={{ color: season.ink }}>
                      {STORE_NAME}
                    </p>
                    <p className="text-[31pt] font-black leading-[1.15] tracking-[0.04em]" style={{ color: season.ink }}>
                      営業カレンダー
                    </p>
                  </div>
                  <div
                    className="flex items-baseline gap-[1.5mm] tabular-nums"
                    style={{ color: season.ink, textShadow: "0 1px 3px rgba(255,255,255,0.65)" }}
                  >
                    <span className="text-[17pt] font-bold">{year}年</span>
                    {/* leading-none だと画像化時に字形の下が切れるため行の高さを確保する */}
                    <span className="text-[50pt] font-black leading-[1.15]">{month}</span>
                    <span className="text-[20pt] font-bold">月</span>
                  </div>
                </div>
              </div>
            </header>

            <main className="flex min-h-0 flex-1 flex-col px-[9mm] pb-[2mm] pt-[3mm]">
              <PosterCalendar ym={ym} days={days} events={events} types={types} holidays={holidays} season={season} />
            </main>

            {/* フッター（凡例）。●は図形ではなく文字にする（画像化時に図形とテキストで縦位置の基準がずれるため） */}
            <footer className="shrink-0 px-[9mm] pb-[5mm] pt-[2mm]">
              {footnotes.length > 0 && (
                <div className="mb-[1.5mm] text-[10.5pt] font-medium leading-[1.4] text-[#374151]">
                  {footnotes.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-black/10 pt-[2mm] text-[8.5pt] leading-[1.3] text-[#6b7280]">
                <div className="flex items-center gap-[5mm]">
                  <span>
                    <span className="text-[#1f9d55]">●</span> 営業時間
                  </span>
                  {legendTypes.map((t) => (
                    <span key={t.id}>
                      <span style={{ color: EVENT_COLORS[t.color].text }}>●</span> {t.name}
                    </span>
                  ))}
                  <span className="text-[#9aa1ab]">「休」＝定休日</span>
                </div>
                <span className="text-[#9aa1ab]">※営業時間・イベントは変更になる場合があります</span>
              </div>
            </footer>
          </div>
        </div>
      </div>

      {dialog && (
        <PdfPreviewDialog
          title={dialog === "pdf" ? "ポスター（PDF）" : "ポスター（画像）"}
          subtitle={`${year}年${month}月`}
          kindLabel={dialog === "pdf" ? "PDF" : "画像"}
          filename={`${fileBase}.${dialog === "pdf" ? "pdf" : "png"}`}
          make={() => {
            const el = sheetRef.current;
            if (!el) return Promise.reject(new Error("ポスターが表示されていません"));
            return dialog === "pdf" ? capturePosterPdf(el) : capturePosterImage(el);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
