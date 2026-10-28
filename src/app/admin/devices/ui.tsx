"use client";

import { useState, useTransition } from "react";
import { zebraRowClass } from "@/lib/table";
import { DEVICE_LABEL_APP, splitDeviceLabel } from "@/lib/device";
import { approveDevices, revokeDevices } from "./actions";

export type DeviceRow = {
  id: string;
  owner_id: string;
  /** 従業員No(共有アカウントなどは null)。一覧は従業員画面と同じ No 順(DB の device_list が並べる) */
  owner_employee_no: string | null;
  owner_name: string;
  owner_is_admin: boolean;
  is_me: boolean;
  app: "payroll" | "business";
  label: string;
  status: "pending" | "approved" | "revoked";
  approved_how: "existing" | "admin" | "invite" | "code" | "handoff" | null;
  approved_at: string | null;
  approver_name: string | null;
  created_at: string;
  last_seen_at: string;
};

const APP_LABEL = { payroll: "給与", business: "経費" } as const;

/**
 * 画面の1行 = 記録1件(端末の合言葉1つ)。iPhone はホーム画面アプリと Safari で Cookie が別なので記録上は別件になり、
 * 給与と経費のアプリでも別件になる。以前は「同じ人・同じ端末名」を1行にまとめていたが、
 * どの開き方で承認待ちが出たのか分からなくなるため、まとめずにそのまま出し、氏名ごとにくくる(2026-10-28)。
 * 並び(従業員No順→承認待ち→最近使った順)は DB の device_list が決める。
 */
type OwnerGroup = { ownerId: string; rows: DeviceRow[] };

function groupByOwner(rows: DeviceRow[]): OwnerGroup[] {
  const groups: OwnerGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.ownerId === r.owner_id) last.rows.push(r);
    else groups.push({ ownerId: r.owner_id, rows: [r] });
  }
  return groups;
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

/** 管理者の承認以外の承認のしかた(管理者の承認は承認者の名前を出す) */
const APPROVED_HOW_LABEL: Partial<Record<NonNullable<DeviceRow["approved_how"]>, string>> = {
  existing: "(導入時から利用)",
  invite: "(登録直後・自動)",
  code: "(確認コード)",
  handoff: "(ホーム画面に追加)",
};

function approverText(row: DeviceRow): string {
  if (row.status !== "approved") return "—";
  return APPROVED_HOW_LABEL[row.approved_how ?? "admin"] ?? row.approver_name ?? "—";
}

/** 明細行の中で改行しない */
const cell = "whitespace-nowrap px-3 py-2";

function StatusBadge({ status }: { status: DeviceRow["status"] }) {
  if (status === "pending") {
    return <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">承認待ち</span>;
  }
  if (status === "revoked") {
    return <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">取り消し済</span>;
  }
  return <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">承認済</span>;
}

export function DevicesView({ devices }: { devices: DeviceRow[] }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = groupByOwner(devices);
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
              <th className={cell}>氏名</th>
              <th className={cell}>端末</th>
              <th className={cell}>OS</th>
              <th className={cell}>アプリ</th>
              <th className={cell}>状態</th>
              <th className={cell}>承認者</th>
              <th className={cell}>最終利用</th>
              <th className={cell}>初回</th>
              <th className={cell}></th>
            </tr>
          </thead>
          {/* 1人ごとに tbody を分け、縞模様は人ごと(同じ人の行は同じ色) */}
          {groups.map((g, gi) => (
            <tbody key={g.ownerId} className={`border-t border-gray-200 ${zebraRowClass(gi)}`}>
              {g.rows.map((d, i) => {
                const { device, os, app } = splitDeviceLabel(d.label);
                const summary = `${d.owner_name} / ${APP_LABEL[d.app]} / ${d.label}`;
                return (
                  <tr key={d.id} className={i > 0 ? "border-t border-gray-100" : ""}>
                    {i === 0 && (
                      <td rowSpan={g.rows.length} className={`${cell} align-top`}>
                        {d.owner_name}
                        {d.owner_is_admin && <span className="ml-1 text-xs text-gray-400">(管理者)</span>}
                        <div className="text-xs text-gray-400">{d.owner_employee_no ?? "—"}</div>
                      </td>
                    )}
                    <td className={cell}>{device}</td>
                    <td className={cell}>{os}</td>
                    <td className={cell}>
                      {app === DEVICE_LABEL_APP ? (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{app}</span>
                      ) : (
                        app
                      )}
                      {d.app === "business" && <span className="ml-1 text-xs text-gray-400">(経費)</span>}
                    </td>
                    <td className={cell}>
                      <StatusBadge status={d.status} />
                      {d.status !== "approved" &&
                        (d.is_me ? (
                          <span className="ml-2 text-xs text-gray-500">もう1人の管理者が承認</span>
                        ) : (
                          <button
                            disabled={pending}
                            onClick={() => run(() => approveDevices([d.id], summary))}
                            className="ml-2 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            承認
                          </button>
                        ))}
                    </td>
                    <td className={`${cell} text-gray-600`}>{approverText(d)}</td>
                    <td className={`${cell} text-gray-600`}>{formatTs(d.last_seen_at)}</td>
                    <td className={`${cell} text-gray-600`}>{formatTs(d.created_at)}</td>
                    <td className={`${cell} text-right`}>
                      {d.status !== "revoked" && (
                        <button
                          disabled={pending}
                          onClick={() => run(() => revokeDevices([d.id], summary))}
                          className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          取り消し
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
