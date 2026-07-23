"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { periodFromKey, workMinutes } from "@/lib/period";
import { calculatePeriodPayroll } from "@/lib/payroll-data";
import { effectiveAt } from "@/lib/payroll";
import { logActivity } from "@/lib/log";
import {
  buildPayslipMailText,
  getSenderEmail,
  sendMail,
  type PayslipDailyRow,
} from "@/lib/email";
import type { ActionResult } from "../employees/actions";

/** 締め処理: 期間をロックし、全員分の給与明細を確定保存する */
export async function closePeriod(periodKey: string): Promise<ActionResult> {
  await requireAdmin();
  const period = periodFromKey(periodKey);
  if (!period) return { ok: false, message: "期間の指定が不正です" };

  try {
  const payrolls = await calculatePeriodPayroll(period);
  const errors = payrolls.filter((p) => p.error);
  if (errors.length > 0) {
    return {
      ok: false,
      message: `計算できない従業員がいるため締められません: ${errors
        .map((e) => `${e.nickname?.trim() || e.name}(${e.error})`)
        .join(" / ")}`,
    };
  }

  const supabase = await createClient();

  // 期間を作成/更新して締め状態に
  const { data: payPeriod, error: periodError } = await supabase
    .from("pay_periods")
    .upsert(
      {
        period_label: period.label,
        start_date: period.start,
        end_date: period.end,
        payment_date: period.paymentDate,
        status: "closed",
      },
      { onConflict: "start_date,end_date" }
    )
    .select("id, status")
    .single();

  if (periodError) {
    return { ok: false, message: "締め処理に失敗しました: " + periodError.message };
  }

  // 明細を確定保存(再締めの場合は上書き)
  const now = new Date().toISOString();
  const rows = payrolls.map((p) => ({
    employee_id: p.employee_id,
    pay_period_id: payPeriod.id,
    work_days: p.result!.work_days,
    total_minutes: p.result!.total_minutes,
    night_minutes: p.result!.night_minutes,
    hourly_wage: p.result!.hourly_wage,
    base_pay: p.result!.base_pay,
    night_pay: p.result!.night_pay,
    transport_total: p.result!.transport_total,
    lunch_total: p.result!.lunch_total,
    gross_pay: p.result!.gross_pay,
    income_tax: p.result!.income_tax,
    net_pay: p.result!.net_pay,
    tax_category: p.result!.tax_category,
    finalized_at: now,
  }));

  const { error: payslipError } = await supabase
    .from("payslips")
    .upsert(rows, { onConflict: "employee_id,pay_period_id" });

  if (payslipError) {
    // 明細保存に失敗したら期間を戻す
    await supabase
      .from("pay_periods")
      .update({ status: "open" })
      .eq("id", payPeriod.id);
    return {
      ok: false,
      message: "明細の保存に失敗しました: " + payslipError.message,
    };
  }

  revalidatePath("/admin/close");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${period.label}を締めました(${rows.length}名分の明細を作成)`,
  };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logActivity("エラー", `締め処理に失敗: ${period.label} / ${message}`);
    return { ok: false, message: "締め処理に失敗しました: " + message };
  }
}

/** 締め解除: 申告漏れ対応のため期間を再オープンする(支払済みは不可) */
export async function reopenPeriod(periodKey: string): Promise<ActionResult> {
  await requireAdmin();
  const period = periodFromKey(periodKey);
  if (!period) return { ok: false, message: "期間の指定が不正です" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pay_periods")
    .update({ status: "open" })
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .eq("status", "closed")
    .select("id");

  if (error || !data || data.length === 0) {
    return {
      ok: false,
      message: "締め解除できませんでした(支払済みの期間は解除できません)",
    };
  }

  revalidatePath("/admin/close");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${period.label}の締めを解除しました。修正後に再度締めてください(明細は再計算されます)`,
  };
}

/** 給与明細をメール配信する(全員 or 未配信のみ) */
export async function emailPayslips(
  periodKey: string,
  onlyUnsent: boolean
): Promise<ActionResult> {
  await requireAdmin();
  const period = periodFromKey(periodKey);
  if (!period) return { ok: false, message: "期間の指定が不正です" };

  const supabase = await createClient();
  const { data: payPeriod } = await supabase
    .from("pay_periods")
    .select("id, period_label, payment_date")
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .neq("status", "open")
    .maybeSingle();

  if (!payPeriod) {
    return { ok: false, message: "先に締め処理を実行してください" };
  }

  const { data: payslips } = await supabase
    .from("payslips")
    .select(
      `id, employee_id, work_days, total_minutes, night_minutes, hourly_wage, base_pay,
       night_pay, transport_total, lunch_total, gross_pay, income_tax, net_pay,
       tax_category, emailed_at, employees ( name, email )`
    )
    .eq("pay_period_id", payPeriod.id);

  // 日別明細用に当期の勤務実績と昼食補助(日額)を取得する
  const [{ data: periodEntries }, { data: allowances }] = await Promise.all([
    supabase
      .from("work_entries")
      .select(
        "employee_id, work_date, start_time, end_time, break_minutes, transport_cost"
      )
      .gte("work_date", period.start)
      .lte("work_date", period.end)
      .order("work_date"),
    supabase
      .from("allowance_settings")
      .select("lunch_allowance_per_day, effective_from"),
  ]);
  const lunchPerDay =
    effectiveAt(allowances ?? [], period.end)?.lunch_allowance_per_day ?? 0;
  const entriesByEmployee = new Map<string, PayslipDailyRow[]>();
  for (const e of periodEntries ?? []) {
    // 退勤未入力(締め済みなら通常発生しない)は日別明細から除外
    if (!e.end_time) continue;
    const rows = entriesByEmployee.get(e.employee_id) ?? [];
    const start = e.start_time.slice(0, 5);
    const end = e.end_time.slice(0, 5);
    rows.push({
      workDate: e.work_date,
      startTime: start,
      endTime: end,
      breakMinutes: e.break_minutes,
      workMinutes: workMinutes(start, end, e.break_minutes),
      transport: e.transport_cost,
      lunch: lunchPerDay,
    });
    entriesByEmployee.set(e.employee_id, rows);
  }

  // 送信元アドレス(会社Gmail)には配信しない。従業員として送信元と同じメールが
  // 登録されていると 0 円明細などが自分宛に届いてしまうため除外する。
  const senderEmail = (await getSenderEmail())?.trim().toLowerCase();

  const targets = (payslips ?? []).filter((p) => {
    if (onlyUnsent && p.emailed_at) return false;
    const emp = p.employees as unknown as { name: string; email: string };
    const email = emp.email?.trim().toLowerCase();
    if (!email) return false;
    if (senderEmail && email === senderEmail) return false;
    return true;
  });
  if (targets.length === 0) {
    return { ok: false, message: "配信対象がありません" };
  }

  let sent = 0;
  const failed: string[] = [];
  for (const p of targets) {
    const emp = p.employees as unknown as { name: string; email: string };
    const result = await sendMail({
      to: emp.email,
      subject: `【給与明細】${payPeriod.period_label}`,
      text: buildPayslipMailText({
        name: emp.name,
        periodLabel: payPeriod.period_label,
        paymentDate: payPeriod.payment_date,
        workDays: p.work_days,
        totalMinutes: p.total_minutes,
        nightMinutes: p.night_minutes,
        hourlyWage: p.hourly_wage,
        basePay: p.base_pay,
        nightPay: p.night_pay,
        transportTotal: p.transport_total,
        lunchTotal: p.lunch_total,
        grossPay: p.gross_pay,
        incomeTax: p.income_tax,
        netPay: p.net_pay,
        taxCategory: p.tax_category,
        dailyRows: entriesByEmployee.get(p.employee_id) ?? [],
      }),
    });
    if (result.ok) {
      sent += 1;
      await supabase
        .from("payslips")
        .update({ emailed_at: new Date().toISOString() })
        .eq("id", p.id);
    } else {
      failed.push(`${emp.name}(${result.message})`);
    }
  }

  revalidatePath("/admin/close");
  if (failed.length > 0) {
    return {
      ok: sent > 0,
      message: `${sent}件送信 / 失敗: ${failed.join("、")}`,
    };
  }
  return { ok: true, message: `${sent}名に給与明細をメール配信しました` };
}

/** 支払済みにする */
export async function markPaid(periodKey: string): Promise<ActionResult> {
  await requireAdmin();
  const period = periodFromKey(periodKey);
  if (!period) return { ok: false, message: "期間の指定が不正です" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pay_periods")
    .update({ status: "paid" })
    .eq("start_date", period.start)
    .eq("end_date", period.end)
    .eq("status", "closed")
    .select("id");

  if (error || !data || data.length === 0) {
    return { ok: false, message: "更新できませんでした(先に締めてください)" };
  }

  revalidatePath("/admin/close");
  revalidatePath("/admin");
  return { ok: true, message: `${period.label}を支払済みにしました` };
}
