"use server";

import { requireAdmin } from "@/lib/auth";
import { loadDailyReport } from "@/lib/daily-report";
import { WEEKDAYS, weekdayOf } from "@/lib/period";

export type DailyCsvResult =
  | { ok: true; filename: string; csv: string }
  | { ok: false; message: string };

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function csvEscape(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * 日当レポートのCSV(BOM付き)を生成する。
 * 従業員ごとに日別の行を並べ、各従業員の末尾に小計行を入れる。
 */
export async function buildDailyReportCsv(
  from: string,
  to: string
): Promise<DailyCsvResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, message: "期間の指定が不正です" };
  }
  if (from > to) {
    return { ok: false, message: "開始日は終了日以前にしてください" };
  }

  const report = await loadDailyReport(from, to);
  if (report.employees.length === 0) {
    return { ok: false, message: "対象期間に勤務データがありません" };
  }

  const header = [
    "従業員No",
    "氏名",
    "日付",
    "曜日",
    "出勤",
    "退勤",
    "休憩",
    "実働",
    "うち深夜",
    "うち残業",
    "時給",
    "基本給",
    "深夜手当",
    "残業手当",
    "昼食補助",
    "交通費",
    "支給額",
    "備考",
  ].join(",");

  const lines: string[] = [];
  for (const emp of report.employees) {
    for (const r of emp.rows) {
      lines.push(
        [
          emp.employeeNo,
          csvEscape(emp.name),
          r.workDate,
          WEEKDAYS[weekdayOf(r.workDate)],
          r.startTime,
          r.endTime ?? "",
          hhmm(r.breakMinutes),
          hhmm(r.workMinutes),
          hhmm(r.nightMinutes),
          hhmm(r.overtimeMinutes),
          r.hourlyWage,
          r.basePay,
          r.nightPay,
          r.overtimePay,
          r.lunch,
          r.transport,
          r.total,
          csvEscape(r.error ?? ""),
        ].join(",")
      );
    }
    const t = emp.totals;
    lines.push(
      [
        emp.employeeNo,
        csvEscape(emp.name),
        "小計",
        "",
        "",
        "",
        "",
        hhmm(t.workMinutes),
        hhmm(t.nightMinutes),
        hhmm(t.overtimeMinutes),
        "",
        t.basePay,
        t.nightPay,
        t.overtimePay,
        t.lunch,
        t.transport,
        t.total,
        csvEscape(`${t.days}日`),
      ].join(",")
    );
  }

  // Excelで文字化けしないよう先頭にBOMを付与
  const csv = "﻿" + [header, ...lines].join("\r\n") + "\r\n";
  return { ok: true, filename: `daily_${from}_${to}.csv`, csv };
}
