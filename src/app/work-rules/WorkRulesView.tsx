import Link from "next/link";
import { durationLabel, type ShiftRule, type ShiftVariant, type TimeRange } from "@/lib/work-rules";
import type { SlotKey } from "@/lib/shifts";

/**
 * 勤務ルール（休憩時間と深夜勤務時間について）。
 * 元は固定の画像（オオミナミ勤務ルール.jpg）だったものを、同じレイアウトで
 * 「営業と勤務時間」の定義から組み立てる（2026-09-24）。時刻は深夜0時を「0:00」と書く（アプリ全体の表記）。
 */

const range = (r: TimeRange) => `${r.start}〜${r.end}`;

/** 通しでない日の時間帯を、通しの日との違いだけで書く（開始が同じなら「〜23:00」） */
function diffRange(base: TimeRange, other: TimeRange): string {
  return base.start === other.start ? `〜${other.end}` : range(other);
}

/** 通しでない日の深夜勤務時間（通しの日と同じなら null） */
function nightDiffLabel(base: ShiftVariant, other: ShiftVariant): string | null {
  if (other.night.length === 0) return "なし";
  const same =
    other.nightMinutes === base.nightMinutes &&
    other.night.map(range).join() === base.night.map(range).join();
  if (same) return null;
  const parts = other.night.map((n, i) => (base.night[i] ? diffRange(base.night[i], n) : range(n)));
  return `${parts.join("、")}（${durationLabel(other.nightMinutes)}）`;
}

/** 番ごとの色（元の資料: 早番=緑・遅番=オレンジ・深夜番=紺） */
const THEME: Record<SlotKey, { head: string; line: string; box: string; icon: "sun" | "sunset" | "moon" }> = {
  A: { head: "bg-[#1e7b3c]", line: "border-[#1e7b3c]/50", box: "border-[#1e7b3c] bg-[#eef8f0] text-[#1e7b3c]", icon: "sun" },
  B: { head: "bg-[#e0701a]", line: "border-[#e0701a]/50", box: "border-[#e0701a] bg-[#fff4e8] text-[#c85f10]", icon: "sunset" },
  C: { head: "bg-[#152449]", line: "border-[#152449]/50", box: "border-[#152449] bg-[#eef2fa] text-[#152449]", icon: "moon" },
};

export type VersionTab = { from: string; label: string; href: string; active: boolean };

export function WorkRulesView({
  rules,
  effectiveLabel,
  tabs,
}: {
  rules: ShiftRule[];
  /** "2026年10月1日から適用" など。最初の定義なら null */
  effectiveLabel: string | null;
  /** 今後の変更がある場合の切替（今日の定義＋先の定義）。1つだけなら出さない */
  tabs: VersionTab[];
}) {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#f5f1e6] px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border-2 border-[#d4b25a] bg-[#fffdf7] p-3 shadow-sm sm:p-6">
        <header className="text-center">
          <h1 className="text-[19px] font-black tracking-tight text-[#152449] min-[400px]:text-2xl sm:text-4xl">
            休憩時間と深夜勤務時間について
          </h1>
          <div className="mx-auto mt-2 h-px w-2/3 bg-gradient-to-r from-transparent via-[#d4b25a] to-transparent" />
          <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-800 sm:text-base">
            給与計算を統一し、わかりやすくするため、
            <br />
            <span className="text-red-700">休憩時間</span>および
            <span className="text-red-700">深夜勤務時間</span>は下記の時間を
            <span className="text-red-700">基準として計算</span>いたします。
          </p>
        </header>

        {tabs.length > 1 && (
          <nav className="flex flex-wrap justify-center gap-2" aria-label="適用開始日">
            {tabs.map((t) => (
              <Link
                key={t.from}
                href={t.href}
                replace
                className={`rounded-full border px-4 py-1.5 text-sm font-bold ${
                  t.active ? "border-[#152449] bg-[#152449] text-white" : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        {effectiveLabel && <p className="text-center text-sm font-bold text-[#152449]">{effectiveLabel}</p>}

        {/* 番ごとのカード（スマホは縦に並べる） */}
        <section className="grid gap-3 sm:grid-cols-3">
          {rules.map((r) => {
            const t = THEME[r.key];
            return (
              <div key={r.key} className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
                <div className={`${t.head} flex items-center justify-center gap-3 py-2.5 text-white`}>
                  <span className="text-2xl font-black tracking-widest">{r.label}</span>
                  <ShiftIcon kind={t.icon} />
                </div>
                {/* 遅番は「翌日まで通しの日」を本体に出し、通しでない日は違うところだけ小さく添える */}
                {(() => {
                  const [v, alt] = r.variants;
                  const nightDiff = alt && nightDiffLabel(v, alt);
                  return (
                    <div className="space-y-2 p-3 text-center">
                      <div>
                        <p className="text-sm font-bold text-gray-700">勤務時間</p>
                        <p className="text-2xl font-black tabular-nums text-gray-900">{range(v.work)}</p>
                        {alt && (
                          <p className="text-sm font-bold tabular-nums text-gray-600 sm:text-xs">
                            通しでない日: <span className="whitespace-nowrap">{diffRange(v.work, alt.work)}</span>
                          </p>
                        )}
                      </div>
                      <div className={`border-t-2 border-dotted ${t.line}`} />
                      <div>
                        <p className="text-sm font-bold text-gray-700">休憩時間（基準）</p>
                        {v.breaks.length > 0 ? (
                          <div className="mt-1 space-y-1">
                            {v.breaks.map((b) => (
                              <p key={b.start} className={`rounded-lg border-2 py-1 text-xl font-black tabular-nums ${t.box}`}>
                                {range(b)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-gray-600">※休憩はありません</p>
                        )}
                      </div>
                      {v.night.length > 0 ? (
                        <div>
                          <p className="text-sm font-bold text-gray-700">深夜勤務時間</p>
                          {v.night.map((n, i) => (
                            <p
                              key={n.start}
                              className={`mt-1 flex flex-wrap items-center justify-center gap-x-1 rounded-lg border-2 px-1 py-1 font-black tabular-nums ${
                                r.key === "C" ? "border-[#152449] text-[#152449]" : "border-red-600 text-red-700"
                              }`}
                            >
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <MoonIcon className="h-5 w-5 shrink-0" />
                                <span className="text-lg">{range(n)}</span>
                              </span>
                              {i === v.night.length - 1 && (
                                <span className="whitespace-nowrap text-xs font-bold">（{durationLabel(v.nightMinutes)}）</span>
                              )}
                            </p>
                          ))}
                          {nightDiff && (
                            <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-600 sm:text-xs">
                              通しでない日: <span className="whitespace-nowrap">{nightDiff}</span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="pt-1 text-sm text-gray-600">※深夜勤務はありません</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </section>

        {/* 給与計算について */}
        <section className="overflow-hidden rounded-xl border-2 border-red-700 bg-white">
          <h2 className="bg-red-700 py-2 text-center text-xl font-black tracking-widest text-white">給与計算について</h2>
          <div className="space-y-3 p-3 sm:p-4">
            <p className="text-sm font-semibold text-gray-800 sm:text-base">
              給与は、上記の<span className="text-red-700">休憩時間</span>を差し引いた勤務時間を基準に計算いたします。
            </p>
            <div className="grid gap-3 sm:grid-cols-2 sm:divide-x-2 sm:divide-dotted sm:divide-gray-400">
              <Example no="①" hours={9} />
              <Example no="②" hours={8} className="sm:pl-3" />
            </div>
            <p className="flex items-center gap-2 rounded-lg bg-[#fff6d6] p-2 text-sm font-semibold text-gray-800">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#152449] text-[#f3c74d]">
                <MoonIcon className="h-5 w-5" />
              </span>
              深夜割増賃金についても、上記の深夜勤務時間を基準として計算いたします。
            </p>
          </div>
        </section>

        {/* 実際の休憩について */}
        <section className="overflow-hidden rounded-xl border-2 border-[#152449] bg-white">
          <h2 className="bg-[#152449] py-2 text-center text-xl font-black tracking-widest text-white">実際の休憩について</h2>
          <div className="flex items-center gap-3 p-3 sm:p-4">
            <RestIcon className="hidden h-16 w-16 shrink-0 text-[#152449] sm:block" />
            <div className="space-y-1 text-sm font-semibold leading-relaxed text-gray-800">
              <p>
                上記の休憩時間は、<span className="text-red-700">給与計算をわかりやすくするための基準時間</span>です。
              </p>
              <p>実際には、お客様の状況や業務の都合に合わせて、</p>
              <p className="text-base font-bold text-red-700 underline decoration-[#f3c74d] decoration-4 underline-offset-4">
                休憩は各自で取れるタイミングで自由に取得してください。
              </p>
              <p className="text-gray-600">休憩時間を必ず基準時間どおりに取る必要はありません。</p>
            </div>
          </div>
        </section>

        <footer className="rounded-xl bg-[#152449] px-3 py-3 text-center text-base font-black leading-relaxed text-[#f3c74d] sm:text-lg">
          スタッフ全員が同じ基準で給与計算できるよう、
          <br />
          ご理解とご協力をお願いいたします。
        </footer>
      </div>
    </main>
  );
}

function Example({ no, hours, className = "" }: { no: string; hours: number; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ClockIcon className="h-12 w-12 shrink-0 text-red-700" />
      <div>
        <p className="text-base font-black text-gray-900">
          <span className="mr-2 rounded bg-red-700 px-1.5 py-0.5 text-sm text-white">例{no}</span>
          {hours}時間勤務の場合
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-700">休憩1時間を差し引き、</p>
        <p className="text-lg font-black text-red-700">給与は{hours - 1}時間分</p>
      </div>
    </div>
  );
}

// ---- アイコン（単色の線画。元の資料のイラストの代わり） ----

function ShiftIcon({ kind }: { kind: "sun" | "sunset" | "moon" }) {
  if (kind === "moon") return <MoonIcon className="h-7 w-7 text-[#f3c74d]" />;
  return (
    <svg className="h-7 w-7 text-[#ffd84d]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {kind === "sun" ? (
        <>
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </>
      ) : (
        <>
          <path d="M6 16a6 6 0 0 1 12 0" fill="currentColor" />
          <path d="M2 16h20M5 20h14M12 5v2.5M4.2 9.2l1.8 1.3M19.8 9.2L18 10.5" />
        </>
      )}
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.5V12l-3 2.5" />
    </svg>
  );
}

function RestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 44V30h14l4 14M8 30V20" />
      <circle cx="17" cy="10" r="4" fill="currentColor" />
      <path d="M17 16v12h10M17 20l8 4" />
      <path d="M30 26h10v6a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5v-6ZM40 28h2a2 2 0 0 1 0 4h-2M33 22c0-2 2-2 2-4M37 22c0-2 2-2 2-4" />
    </svg>
  );
}
