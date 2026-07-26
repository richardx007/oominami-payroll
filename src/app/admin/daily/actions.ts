"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/log";
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
    "前払金",
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
          r.advance ?? "",
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
        t.advance,
        csvEscape(`${t.days}日`),
      ].join(",")
    );
  }

  // Excelで文字化けしないよう先頭にBOMを付与
  const csv = "﻿" + [header, ...lines].join("\r\n") + "\r\n";
  return { ok: true, filename: `daily_${from}_${to}.csv`, csv };
}

export type AdvanceResult = { ok: boolean; message: string };

/**
 * 日当を前払金として記録する / 記録を取り消す。
 *
 * amount に金額を渡すとその勤務日の前払金を登録(既存があれば上書き)、null を渡すと
 * 記録を取り消す。記録した前払金は、その勤務日を含む給与期間の給与計算で
 * 差引支給額から控除される(総支給額・課税対象額・源泉所得税は変わらない)。
 */
export async function setAdvancePayment(
  employeeId: string,
  workDate: string,
  amount: number | null
): Promise<AdvanceResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { ok: false, message: "日付の指定が不正です" };
  }

  const supabase = await createClient();

  // 締め済み・支払済みの期間は明細が確定しているため、前払金の変更を受け付けない
  // (受け付けると画面の金額と確定済みの明細がずれる)。
  const { data: closedPeriod } = await supabase
    .from("pay_periods")
    .select("period_label, status")
    .lte("start_date", workDate)
    .gte("end_date", workDate)
    .neq("status", "open")
    .maybeSingle();
  if (closedPeriod) {
    return {
      ok: false,
      message: `${closedPeriod.period_label}は締め済みのため変更できません(先に締め解除してください)`,
    };
  }

  if (amount === null) {
    const { error } = await supabase
      .from("advance_payments")
      .delete()
      .eq("employee_id", employeeId)
      .eq("work_date", workDate);
    if (error) return { ok: false, message: "取り消しに失敗しました" };
    await logActivity("前払金", `前払金の記録を取り消し: ${workDate}`);
  } else {
    if (!Number.isInteger(amount) || amount < 0) {
      return { ok: false, message: "金額の指定が不正です" };
    }
    const { error } = await supabase
      .from("advance_payments")
      .upsert(
        { employee_id: employeeId, work_date: workDate, amount },
        { onConflict: "employee_id,work_date" }
      );
    if (error) return { ok: false, message: "登録に失敗しました" };
    await logActivity(
      "前払金",
      `前払金を記録: ${workDate} / ¥${amount.toLocaleString()}`
    );
  }

  revalidatePath("/admin/daily");
  revalidatePath("/admin/close");
  return { ok: true, message: "" };
}
