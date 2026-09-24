"use client";

import { useState } from "react";
import Link from "next/link";
import { PdfPreviewDialog } from "@/components/PdfPreviewDialog";
import { captureFitA4Pdf } from "@/lib/poster-export";
import type { VersionTab } from "./WorkRulesView";

/** PDF用に画面外へ置く A4 版の書類の id（page.tsx と対応。名前を変えるときは両方直すこと） */
export const WORK_RULES_A4_ID = "work-rules-a4";

/**
 * 勤務ルール画面の上部に固定するヘッダー。
 * - 適用開始日の切替（現在｜10/1〜）。先の定義で内容が変わる場合だけ出す。
 * - PDF: 画面外の A4 版（WORK_RULES_A4_ID）を A4縦1枚の PDF にする（プレビュー → ダウンロード/共有）。
 * - 閉じる: スマホ（特にホーム画面に追加したアプリ）では戻るボタンが無いため。アプリ内から来たら前の画面へ、
 *   それ以外はホーム（/ → 管理者はシフト・従業員は勤務表）へ。PCサイドバーのモーダル（iframe, ?embed=1）では
 *   モーダル自体に×があるので出さない（showClose=false）。
 */
export function WorkRulesHeader({
  tabs,
  showClose,
  pdfFileName,
  pdfSubtitle,
}: {
  tabs: VersionTab[];
  showClose: boolean;
  /** 未指定なら PDF ボタンを出さない(アップロード文書の表示など) */
  pdfFileName?: string;
  pdfSubtitle?: string;
}) {
  const [pdfOpen, setPdfOpen] = useState(false);

  function close() {
    const fromApp =
      window.history.length > 1 &&
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin;
    if (fromApp) window.history.back();
    else window.location.href = "/";
  }

  return (
    <div className="sticky top-0 z-10 border-b border-[#d4b25a]/60 bg-[#152449] px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
        <p className="mr-auto text-base font-bold">勤務ルール</p>
        {/* 適用開始日の切替。スマホでは2行目に回る */}
        {tabs.length > 1 && (
          <nav className="order-last flex w-full gap-1.5 sm:order-none sm:w-auto" aria-label="適用開始日">
            {tabs.map((t) => (
              <Link
                key={t.from}
                href={t.href}
                replace
                className={`flex-1 rounded-full border px-3 py-1 text-center text-sm font-bold sm:flex-none ${
                  t.active ? "border-white bg-white text-[#152449]" : "border-white/40 text-white"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        {pdfFileName && (
          <button
            type="button"
            onClick={() => setPdfOpen(true)}
            className="touch-manipulation rounded-lg border border-white/40 px-3 py-1.5 text-sm font-bold active:opacity-70"
          >
            PDF
          </button>
        )}
        {showClose && (
          <button
            type="button"
            onClick={close}
            className="flex touch-manipulation items-center gap-1 rounded-lg border border-white/40 px-3 py-1.5 text-sm font-bold active:opacity-70"
          >
            <span aria-hidden="true" className="text-lg leading-none">×</span>
            閉じる
          </button>
        )}
      </div>

      {pdfOpen && pdfFileName && (
        <PdfPreviewDialog
          title="勤務ルール（PDF）"
          subtitle={pdfSubtitle}
          filename={pdfFileName}
          make={() => {
            const el = document.getElementById(WORK_RULES_A4_ID);
            if (!el) return Promise.reject(new Error("書類が表示されていません"));
            return captureFitA4Pdf(el);
          }}
          onClose={() => setPdfOpen(false)}
        />
      )}
    </div>
  );
}
