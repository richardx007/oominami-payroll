"use client";

import { useState, useTransition } from "react";
import { zebraRowClass } from "@/lib/table";
import { approveDevice, revokeDevice } from "./actions";

export type DeviceRow = {
  id: string;
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

function StatusBadge({ row }: { row: DeviceRow }) {
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
  const pendingCount = devices.filter((d) => d.status === "pending").length;

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
            {devices.map((d, i) => {
              const summary = `${d.owner_name} / ${APP_LABEL[d.app]} / ${d.label}`;
              return (
                <tr key={d.id} className={`border-t border-gray-100 ${zebraRowClass(i)}`}>
                  <td className="whitespace-nowrap px-3 py-2">
                    {d.owner_name}
                    {d.owner_is_admin && <span className="ml-1 text-xs text-gray-400">(管理者)</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{APP_LABEL[d.app]}</td>
                  <td className="px-3 py-2">{d.label || "不明"}</td>
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
                          onClick={() => run(() => approveDevice(d.id, summary))}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          承認
                        </button>
                      ))}
                    {d.status !== "revoked" && (
                      <button
                        disabled={pending}
                        onClick={() => run(() => revokeDevice(d.id, summary))}
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
