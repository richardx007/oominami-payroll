/**
 * 日当レポート: 任意期間の「従業員 × 日ごと」の勤務時間・支給額一覧
 *
 * 給与期間(前月26日〜当月25日)とは無関係に、開始日〜終了日を自由に指定して
 * 1日単位の支給額を確認するための集計。日当を現金で手渡すときに、その日いくら
 * 渡せばよいかを確認するために使う。
 *
 * 金額の計算方法は給与計算(lib/payroll.ts の computePayslip)と同一:
 *   基本給   = 勤務分数(標準休憩控除後) × 時給 ÷ 60 を日単位で切り捨て
 *   深夜手当 = 深夜分数 × 時給 × 25% ÷ 60 を日単位で切り捨て
 *   残業手当 = 8時間超の分数 × 時給 × 25% ÷ 60 を日単位で切り捨て
 *   昼食補助 = 勤務日ごとに定額 / 交通費 = 申告実費
 * 月次の給与計算と同じ数字になるよう、休憩は入力値ではなく標準休憩帯から導出する。
 *
 * 源泉所得税は月額表による月単位の計算のため、このレポートには含まない。
 * 日当として現金で支払った分は各行から「前払金」として記録でき、その勤務日を含む
 * 給与期間の給与計算で差引支給額から控除される(lib/payroll.ts の advanceTotal)。
 * これにより日当と月末給与の二重払いを防ぎつつ、源泉徴収は月単位のまま維持できる。
 */

import { createClient } from "./supabase/server";
import {
  workMinutes,
  nightMinutes,
  standardBreakMinutes,
  overtimeMinutes,
} from "./period";
import { BREAK_SETTING_KEYS, parseBreakWindows } from "./breaks";
import { effectiveAt } from "./payroll";

export type DailyRow = {
  workDate: string;
  startTime: string;
  endTime: string | null;
  /** 標準休憩ルールから導出した休憩分数 */
  breakMinutes: number;
  workMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  hourlyWage: number;
  basePay: number;
  nightPay: number;
  overtimePay: number;
  lunch: number;
  transport: number;
  /** その日の支給額合計(基本給+深夜+残業+昼食補助+交通費、源泉徴収前) */
  total: number;
  /** 前払金として記録済みの金額。null なら未記録(まだ日当を渡していない) */
  advance: number | null;
  /** 計算できない場合の理由(退勤未入力・時給未設定など)。null なら正常 */
  error: string | null;
  /** 勤務表の入力欄に記録されたメモ(任意) */
  note: string | null;
};

export type DailyEmployeeReport = {
  employeeId: string;
  employeeNo: string;
  name: string;
  nickname: string | null;
  rows: DailyRow[];
  totals: {
    days: number;
    workMinutes: number;
    nightMinutes: number;
    overtimeMinutes: number;
    basePay: number;
    nightPay: number;
    overtimePay: number;
    lunch: number;
    transport: number;
    total: number;
    /** 前払金として記録済みの合計 */
    advance: number;
  };
};

export type DailyReport = {
  from: string;
  to: string;
  employees: DailyEmployeeReport[];
};

function emptyTotals(): DailyEmployeeReport["totals"] {
  return {
    days: 0,
    workMinutes: 0,
    nightMinutes: 0,
    overtimeMinutes: 0,
    basePay: 0,
    nightPay: 0,
    overtimePay: 0,
    lunch: 0,
    transport: 0,
    total: 0,
    advance: 0,
  };
}

/**
 * 指定期間の日当レポートを作成する。
 * 勤務のなかった従業員は含めない(全員分の空行で埋めない)。
 */
export async function loadDailyReport(
  from: string,
  to: string,
  employeeId?: string
): Promise<DailyReport> {
  const supabase = await createClient();

  let employeesQuery = supabase
    .from("employees")
    .select("id, employee_no, name, nickname")
    .eq("is_admin", false)
    .order("employee_no");
  let entriesQuery = supabase
    .from("work_entries")
    .select(
      "employee_id, work_date, start_time, end_time, break_minutes, transport_cost, note"
    )
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date");
  let advancesQuery = supabase
    .from("advance_payments")
    .select("employee_id, work_date, amount")
    .gte("work_date", from)
    .lte("work_date", to);

  // 従業員自身の画面では自分の実績のみに絞る
  if (employeeId) {
    employeesQuery = employeesQuery.eq("id", employeeId);
    entriesQuery = entriesQuery.eq("employee_id", employeeId);
    advancesQuery = advancesQuery.eq("employee_id", employeeId);
  }

  const [
    { data: employees },
    { data: entries },
    { data: wageRates },
    { data: allowances },
    { data: breakSettings },
    { data: advances },
  ] = await Promise.all([
    employeesQuery,
    entriesQuery,
    supabase.from("wage_rates").select("employee_id, hourly_wage, effective_from"),
    supabase
      .from("allowance_settings")
      .select("lunch_allowance_per_day, effective_from"),
    supabase.from("app_settings").select("key, value").in("key", BREAK_SETTING_KEYS),
    advancesQuery,
  ]);

  // 前払金は (従業員, 勤務日) で一意。行ごとの記録状況の表示に使う
  const advanceBy = new Map<string, number>();
  for (const a of advances ?? []) {
    advanceBy.set(`${a.employee_id}_${a.work_date}`, a.amount);
  }

  const breakWindows = parseBreakWindows(breakSettings);

  const entriesBy = new Map<string, NonNullable<typeof entries>>();
  for (const e of entries ?? []) {
    const arr = entriesBy.get(e.employee_id);
    if (arr) arr.push(e);
    else entriesBy.set(e.employee_id, [e]);
  }

  const wagesBy = new Map<string, NonNullable<typeof wageRates>>();
  for (const w of wageRates ?? []) {
    const arr = wagesBy.get(w.employee_id);
    if (arr) arr.push(w);
    else wagesBy.set(w.employee_id, [w]);
  }

  const result: DailyEmployeeReport[] = [];

  for (const emp of employees ?? []) {
    const empEntries = entriesBy.get(emp.id);
    if (!empEntries || empEntries.length === 0) continue;

    const rows: DailyRow[] = [];
    const totals = emptyTotals();

    for (const e of empEntries) {
      const start = e.start_time.slice(0, 5);
      const end = e.end_time ? e.end_time.slice(0, 5) : null;
      // 昼食補助・時給はその勤務日時点で有効な設定を使う(月末時点ではない)
      const lunch =
        effectiveAt(allowances ?? [], e.work_date)?.lunch_allowance_per_day ?? 0;
      const wage = effectiveAt(wagesBy.get(emp.id) ?? [], e.work_date);
      const advance = advanceBy.get(`${emp.id}_${e.work_date}`) ?? null;

      if (!end || !wage) {
        rows.push({
          workDate: e.work_date,
          startTime: start,
          endTime: end,
          breakMinutes: 0,
          workMinutes: 0,
          nightMinutes: 0,
          overtimeMinutes: 0,
          hourlyWage: wage?.hourly_wage ?? 0,
          basePay: 0,
          nightPay: 0,
          overtimePay: 0,
          lunch: 0,
          transport: e.transport_cost,
          total: 0,
          advance,
          error: !end ? "退勤未入力" : "時給未設定",
          note: e.note,
        });
        continue;
      }

      const brk = standardBreakMinutes(start, end, breakWindows);
      const minutes = workMinutes(start, end, brk);
      const nm = nightMinutes(start, end, breakWindows);
      const om = overtimeMinutes(minutes);
      const basePay = Math.floor((minutes * wage.hourly_wage) / 60);
      const nightPay = Math.floor((nm * wage.hourly_wage * 0.25) / 60);
      const overtimePay = Math.floor((om * wage.hourly_wage * 0.25) / 60);
      const total =
        basePay + nightPay + overtimePay + lunch + e.transport_cost;

      rows.push({
        workDate: e.work_date,
        startTime: start,
        endTime: end,
        breakMinutes: brk,
        workMinutes: minutes,
        nightMinutes: nm,
        overtimeMinutes: om,
        hourlyWage: wage.hourly_wage,
        basePay,
        nightPay,
        overtimePay,
        lunch,
        transport: e.transport_cost,
        total,
        advance,
        error: null,
        note: e.note,
      });

      totals.days += 1;
      totals.workMinutes += minutes;
      totals.nightMinutes += nm;
      totals.overtimeMinutes += om;
      totals.basePay += basePay;
      totals.nightPay += nightPay;
      totals.overtimePay += overtimePay;
      totals.lunch += lunch;
      totals.transport += e.transport_cost;
      totals.total += total;
      totals.advance += advance ?? 0;
    }

    result.push({
      employeeId: emp.id,
      employeeNo: emp.employee_no,
      name: emp.name,
      nickname: emp.nickname,
      rows,
      totals,
    });
  }

  return { from, to, employees: result };
}
