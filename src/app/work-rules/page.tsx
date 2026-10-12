import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBreakWindows } from "@/lib/breaks";
import { jstTodayKey, PATTERN_BASE_DATE } from "@/lib/business-calendar-view";
import { parseSlots } from "@/lib/shifts";
import { buildShiftRules } from "@/lib/work-rules";
import { workSettingsAt, type WorkTimeSettingRow } from "@/lib/work-time";
import { WORK_RULES_A4_ID, WorkRulesHeader } from "./WorkRulesHeader";
import { WorkRulesDocument, type VersionTab } from "./WorkRulesView";

/**
 * 勤務ルールを表示する共有ページ(従業員・管理者どちらのハンバーガーメニュー、シフト表からも遷移)。
 * 「営業と勤務時間」の定義(今日有効なもの)から組み立てた画面を表示する。
 * 先の適用開始日の定義があれば、ヘッダーの「現在｜10/1〜」で切り替えて見られる(?from=YYYY-MM-DD)。
 * ヘッダーの「PDF」で、画面外に置いた A4 版の書類を A4縦1枚の PDF にできる。
 * 2026-10-12: 表示方法の切替(アップロードした文書の表示)は廃止し、この画面に固定した(オーナー依頼)。
 *   ストレージ work-rules バケットの旧文書と app_settings の work_rules_* は参照しなくなっただけで残っている。
 * 管理者のメニュー「勤務ルール」は /admin/work-rules(説明＋「勤務ルールの表示」ボタン)を開き、そこからここへ来る。
 * 上部のヘッダー(WorkRulesHeader)に「閉じる」を出す。?embed=1(iframe 埋め込み用)では「閉じる」は出さない。
 */
export default async function WorkRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; embed?: string }>;
}) {
  await requireEmployee(); // ログイン確認(管理者・従業員どちらも可)
  const supabase = await createClient();

  const { from, embed } = await searchParams;
  const embedded = embed === "1";

  const { data: wt } = await supabase
    .from("work_time_settings")
    .select("effective_from, key, value");
  const settings = (wt ?? []) as WorkTimeSettingRow[];

  // 今日有効な定義と、それより先の定義
  const today = jstTodayKey();
  const versions = [...new Set(settings.map((r) => r.effective_from))].sort();
  const current = versions.filter((v) => v <= today).at(-1) ?? PATTERN_BASE_DATE;
  // 先の定義は、表示内容(シフト枠・休憩時間)が直前と変わるものだけ切替に出す
  const keyOf = (v: string) =>
    JSON.stringify(workSettingsAt(settings, v).sort((x, y) => x.key.localeCompare(y.key)));
  const shown = [current];
  for (const v of versions.filter((v) => v > today)) {
    if (keyOf(v) !== keyOf(shown[shown.length - 1])) shown.push(v);
  }
  const selected = from && shown.includes(from) ? from : current;

  const kv = workSettingsAt(settings, selected);
  const rules = buildShiftRules(parseSlots(kv), parseBreakWindows(kv));

  const ymd = (d: string) =>
    `${Number(d.slice(0, 4))}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const tabs: VersionTab[] = shown.map((v, i) => ({
    from: v,
    label: i === 0 ? "現在" : `${md(v)}〜`,
    href:
      "/work-rules?" +
      new URLSearchParams({ ...(i > 0 ? { from: v } : {}), ...(embedded ? { embed: "1" } : {}) }).toString(),
    active: v === selected,
  }));
  // 書類右上の版表記。最初の定義(日付なし)は「初版」
  const versionLabel = selected === PATTERN_BASE_DATE ? "初版" : `${ymd(selected)} 版`;

  return (
    <>
      <WorkRulesHeader
        tabs={tabs}
        showClose={!embedded}
        pdfFileName={`勤務ルール_${selected === PATTERN_BASE_DATE ? "初版" : `${selected}版`}.pdf`}
        pdfSubtitle={versionLabel}
      />
      <main className="min-h-[calc(100vh-3rem)] bg-[#f5f1e6] px-3 py-4 sm:px-6 sm:py-8">
        <WorkRulesDocument rules={rules} versionLabel={versionLabel} />
      </main>
      {/* PDF用の A4 版(幅 794px = A4 の 96dpi 換算)。画面外に置き、PDF ボタンで画像化する。
          display:none だと画像化できないので位置だけ外す */}
      <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 794 }}>
        <div id={WORK_RULES_A4_ID} className="bg-white p-2">
          <WorkRulesDocument rules={rules} versionLabel={versionLabel} />
        </div>
      </div>
    </>
  );
}
