// Worker の CPU 時間の集計(月1回の確認用。2026-10-18)。
//
// 無料プランは CPU 時間が1回 10ms までで、超えると Error 1102 になる。次の2つを表示する:
//   1. 日ごとのリクエスト数と 1102 の件数(直近 28 日。給与管理・経費管理の両方)
//   2. 画面(パス)ごとの CPU 時間の順位(Workers Logs。無料プランは 3 日分しか残らない)
//
// 使い方: node scripts/cpu-report.mjs [日数(2の期間。既定 3)]
// 環境変数 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID が必要(.claude/settings.local.json の env)。
// トークンには Workers Scripts と Workers Observability: Read の権限が要る。
//
// 見方: 中央値が数十 ms を超える画面は、毎回重い(作りを見直す)。最大だけが 100〜300ms の画面は、
// 新しい実行環境で初めて表示した回の準備の時間なので気にしなくてよい。
// 詳細は docs/handover.md の 2026-10-18 の項。

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!TOKEN || !ACCOUNT) {
  console.error("CLOUDFLARE_API_TOKEN と CLOUDFLARE_ACCOUNT_ID を設定してください");
  process.exit(1);
}

const WORKERS = ["oominami-payroll", "oominami-business"];
const DAY = 86400000;
const logDays = Math.min(Number(process.argv[2]) || 3, 3);
const api = `https://api.cloudflare.com/client/v4`;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json();
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json;
}

/** 日本時間の "MM/DD" */
const jstMd = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
};

// ---- 1. 日ごとの件数(GraphQL Analytics) ----
async function dailyErrors() {
  const now = Date.now();
  const json = await post(`${api}/graphql`, {
    query: `query($a:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$a}){
      workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$from,datetime_leq:$to}){
        dimensions{scriptName status datetimeHour} sum{requests}}}}}`,
    variables: {
      a: ACCOUNT,
      from: new Date(now - 28 * DAY).toISOString(),
      to: new Date(now).toISOString(),
    },
  });
  const rows = json.data.viewer.accounts[0].workersInvocationsAdaptive;
  // 日本時間の日付ごとに集計する
  const table = new Map();
  for (const r of rows) {
    const { scriptName, status, datetimeHour } = r.dimensions;
    if (!WORKERS.includes(scriptName)) continue;
    const day = jstMd(datetimeHour);
    const key = `${day} ${scriptName}`;
    const t = table.get(key) ?? { day, scriptName, requests: 0, exceeded: 0 };
    t.requests += r.sum.requests;
    if (status === "exceededResources") t.exceeded += r.sum.requests;
    table.set(key, t);
  }
  console.log("■ 日ごとのリクエスト数と Error 1102 の件数(日本時間・直近28日)");
  const days = [...new Set([...table.values()].map((t) => t.day))].sort();
  console.log(`  日付   ${WORKERS.map((w) => `${w}(件数 / 1102)`.padEnd(34)).join("")}`);
  for (const day of days) {
    const cells = WORKERS.map((w) => {
      const t = table.get(`${day} ${w}`);
      return (t ? `${String(t.requests).padStart(6)} / ${String(t.exceeded).padStart(3)}` : "     -").padEnd(34);
    });
    console.log(`  ${day}  ${cells.join("")}`);
  }
  console.log();
}

// ---- 2. 画面ごとの CPU 時間(Workers Logs) ----
async function calc(service, calculations, extraFilters = []) {
  const now = Date.now();
  const json = await post(`${api}/accounts/${ACCOUNT}/workers/observability/telemetry/query`, {
    queryId: "cpu-report",
    timeframe: { from: now - logDays * DAY, to: now },
    view: "calculations",
    parameters: {
      limit: 200,
      filters: [
        { key: "$metadata.service", operation: "eq", type: "string", value: service },
        { key: "$workers.eventType", operation: "eq", type: "string", value: "fetch" },
        ...extraFilters,
      ],
      calculations,
      groupBys: [{ type: "string", value: "$metadata.trigger" }],
    },
  });
  // 計算の種類ごとに { パス: 値 } を返す
  return json.result.calculations.map(
    (c) => new Map(c.aggregates.map((a) => [a.groups[0].value, a.value]))
  );
}

async function ranking(service) {
  const cpu = { keyType: "number", key: "$workers.cpuTimeMs" };
  const [count, median, max] = await calc(service, [
    { operator: "count" },
    { operator: "median", ...cpu },
    { operator: "max", ...cpu },
  ]);
  const [over] = await calc(
    service,
    [{ operator: "count" }],
    [{ key: "$workers.cpuTimeMs", operation: "gt", type: "number", value: 100 }]
  );
  const [errors] = await calc(
    service,
    [{ operator: "count" }],
    [{ key: "$workers.outcome", operation: "neq", type: "string", value: "ok" }]
  );
  const rows = [...count.keys()]
    .map((path) => ({
      path,
      n: count.get(path),
      median: median.get(path) ?? 0,
      max: max.get(path) ?? 0,
      over: over.get(path) ?? 0,
      errors: errors.get(path) ?? 0,
    }))
    .sort((a, b) => b.median - a.median || b.max - a.max)
    .slice(0, 25);
  console.log(`■ ${service}: 画面ごとの CPU 時間(直近${logDays}日・中央値の大きい順・上位25)`);
  // 全角の見出しは2文字分の幅になるので、半角の数字の列に合わせて詰めている
  console.log("   件数  中央値    最大  100ms超  失敗  パス");
  for (const r of rows) {
    const ms = (v) => `${Math.round(v)}ms`.padStart(6);
    console.log(
      `  ${String(r.n).padStart(5)} ${ms(r.median)} ${ms(r.max)} ${String(r.over).padStart(7)} ${String(r.errors).padStart(4)}  ${r.path}`
    );
  }
  console.log();
}

await dailyErrors();
for (const w of WORKERS) await ranking(w);
