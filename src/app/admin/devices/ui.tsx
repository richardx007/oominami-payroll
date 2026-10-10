"use client";

import { useState, useTransition } from "react";
import { zebraRowClass } from "@/lib/table";
import { approveDevices, revokeDevices } from "./actions";

export type DeviceRow = {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_is_admin: boolean;
  is_me: boolean;
  app: "payroll" | "business";
  label: string;
  status: "pending" | "approved" | "revoked";
  approved_how: "existing" | "admin" | null;
  approved_at: string | null;
  approver_name: string | null;
  created_at: string;
  last_seen_at: string;
};

const APP_LABEL = { payroll: "給与", business: "経費" } as const;

/**
 * 画面の1行(=1台の端末)。iPhone はホーム画面アプリと Safari で Cookie が別なので記録上は2件になり、
 * 給与と経費のアプリでも別件になる。見分けられないので「同じ人・同じ端末名・同じ状態」を1行にまとめる。
 * ⚠️ 状態もキーに入れること。承認待ちの新しい端末が、承認済みの同じ名前の端末に紛れて見落とされないように。
 */
type DeviceGroup = DeviceRow & { ids: string[]; apps: DeviceRow["app"][]; count: number };

function groupDevices(rows: DeviceRow[]): DeviceGroup[] {
  const map = new Map<string, DeviceGroup>();
  for (const r of rows) {
    const key = `${r.owner_id}|${r.label}|${r.status}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, { ...r, ids: [r.id], apps: [r.app], count: 1 });
      continue;
    }
    g.ids.push(r.id);
    g.count++;
    if (!g.apps.includes(r.app)) g.apps.push(r.app);
    if (r.last_seen_at > g.last_seen_at) g.last_seen_at = r.last_seen_at;
    if (r.created_at < g.created_at) g.created_at = r.created_at;
    // 1件でも管理者が承認していれば「承認済み(承認者)」と出す
    if (r.approved_how === "admin") {
      g.approved_how = "admin";
      g.approver_name = r.approver_name;
    }
  }
  return Array.from(map.values());
}

function formatTs(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ row }: { row: DeviceGroup }) {
  if (row.status === "pending") {
    return <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">承認待ち</span>;
  }
  if (row.status === "revoked") {
    return <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">取り消し済み</span>;
  }
  return (
    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      {row.approved_how === "existing" ? "承認済み(導入時から利用)" : `承認済み${row.approver_name ? `(${row.approver_name})` : ""}`}
    </span>
  );
}

export function DevicesView({ devices }: { devices: DeviceRow[] }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = groupDevices(devices);
  const pendingCount = groups.filter((d) => d.status === "pending").length;

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setResult(null);
    startTransition(async () => setResult(await fn()));
  }

  if (devices.length === 0) {
    return <p className="text-sm text-gray-500">まだ端末の記録がありません。</p>;
  }

  return (
    <div className="space-y-2">
      {pendingCount > 0 && (
        <p className="text-sm font-medium text-orange-700">承認待ち: {pendingCount}件</p>
      )}
      {result && (
        <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">氏名</th>
              <th className="px-3 py-2">アプリ</th>
              <th className="px-3 py-2">端末</th>
              <th className="px-3 py-2">状態</th>
              <th className="px-3 py-2">最終利用</th>
              <th className="px-3 py-2">初回</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((d, i) => {
              const apps = d.apps.map((a) => APP_LABEL[a]).join("・");
              const summary = `${d.owner_name} / ${apps} / ${d.label}`;
              return (
                <tr key={d.ids.join(",")} className={`border-t border-gray-100 ${zebraRowClass(i)}`}>
                  <td className="whitespace-nowrap px-3 py-2">
                    {d.owner_name}
                    {d.owner_is_admin && <span className="ml-1 text-xs text-gray-400">(管理者)</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{apps}</td>
                  <td className="px-3 py-2">
                    {d.label || "不明"}
                    {d.count > 1 && (
                      <div className="text-xs text-gray-400">
                        ホーム画面アプリ・ブラウザなど {d.count}件をまとめて表示
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusBadge row={d} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatTs(d.last_seen_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatTs(d.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {d.status !== "approved" &&
                      (d.is_me ? (
                        <span className="text-xs text-gray-500">もう1人の管理者が承認</span>
                      ) : (
                        <button
                          disabled={pending}
                          onClick={() => run(() => approveDevices(d.ids, summary))}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          承認
                        </button>
                      ))}
                    {d.status !== "revoked" && (
                      <button
                        disabled={pending}
                        onClick={() => run(() => revokeDevices(d.ids, summary))}
                        className="ml-2 rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        取り消し
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
