import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBreakWindows } from "@/lib/breaks";
import { jstTodayKey, PATTERN_BASE_DATE } from "@/lib/business-calendar-view";
import { parseSlots } from "@/lib/shifts";
import { buildShiftRules } from "@/lib/work-rules";
import { workSettingsAt, type WorkTimeSettingRow } from "@/lib/work-time";
import { CloseBar } from "./CloseBar";
import { WorkRulesView, type VersionTab } from "./WorkRulesView";

/**
 * 勤務ルールを表示する共有ページ(従業員・管理者どちらのハンバーガーメニュー、シフト表からも遷移)。
 * 表示方法は設定画面「勤務ルール」で切り替える(app_settings の work_rules_mode)。
 * - "generated"(既定): 「営業と勤務時間」の定義(今日有効なもの)から組み立てた画面。
 *   先の適用開始日の定義があれば、上部のボタンで切り替えて見られる(?from=YYYY-MM-DD)。
 * - "image": アップロードした文書(非公開ストレージ work-rules バケット)。画像はこのページ内に表示し、
 *   PDF は署名付きURLへリダイレクトする(ブラウザの PDF ビューアに任せる)。
 * 上部に「閉じる」バー(CloseBar)を出す。PCサイドバーのモーダル(iframe)からは ?embed=1 で開き、バーを出さない。
 * app_settings は管理者のみ SELECT 可のため、メタ情報は get_work_rules_meta() 経由で取得する。
 */
export default async function WorkRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; embed?: string }>;
}) {
  await requireEmployee(); // ログイン確認(管理者・従業員どちらも可)
  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("get_work_rules_meta");
  const meta = new Map(
    ((rows ?? []) as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ])
  );

  const { from, embed } = await searchParams;
  const embedded = embed === "1";

  if (meta.get("work_rules_mode") === "image") {
    const path = meta.get("work_rules_path");
    if (!path) {
      return <Message text="まだ勤務ルールの文書は登録されていません。管理者にご確認ください。" />;
    }
    const { data: signed } = await supabase.storage
      .from("work-rules")
      .createSignedUrl(path, 60);
    if (!signed?.signedUrl) {
      return <Message text="文書の表示に失敗しました。時間をおいて再度お試しください。" />;
    }
    if (meta.get("work_rules_mime") === "application/pdf") redirect(signed.signedUrl);
    return (
      <>
        {!embedded && <CloseBar />}
        <main className="bg-white p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signed.signedUrl} alt="勤務ルール" className="mx-auto h-auto max-w-full" />
        </main>
      </>
    );
  }

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
  const effectiveLabel =
    selected === PATTERN_BASE_DATE
      ? null
      : selected > today
        ? `${ymd(selected)}から適用予定`
        : `${ymd(selected)}から適用`;

  return (
    <>
      {!embedded && <CloseBar />}
      <WorkRulesView rules={rules} effectiveLabel={effectiveLabel} tabs={tabs} />
    </>
  );
}

function Message({ text }: { text: string }) {
  return (
    <>
      <CloseBar />
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <p className="text-lg font-bold text-gray-700">勤務ルール</p>
      <p className="mt-2 text-sm text-gray-500">{text}</p>
      </main>
    </>
  );
}
