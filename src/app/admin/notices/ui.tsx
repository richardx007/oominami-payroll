"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendNotice, sendNoticeEmails } from "./actions";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const REMINDER_TEMPLATE = {
  subject: "勤務表入力のお願い",
  body: "今月度の勤務表が未入力です。締め日(25日)までに入力をお願いします。",
};

export function NoticeForm({
  employees,
}: {
  employees: {
    id: string;
    name: string;
    nickname: string | null;
    employee_no: string;
  }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  /** 全員宛てのメールの進み具合(送った数 / 全体) */
  const [mailProgress, setMailProgress] = useState<{ sent: number; total: number } | null>(null);
  const [type, setType] = useState<"individual" | "reminder">("individual");

  /**
   * 全員宛てのメールを5人ずつ送る(Cloudflare 無料プランの上限対策。給与明細の配信と同じ。actions.ts の sendNoticeEmails)。
   * 返り値はメッセージの続き(「 / メール13件送信(管理者含む)」など)
   */
  async function sendBroadcastMails(noticeId: string): Promise<string> {
    let offset = 0;
    let sent = 0;
    let total = 0;
    const failed: string[] = [];
    try {
      for (;;) {
        const r = await sendNoticeEmails(noticeId, offset, 5);
        if (r.error) return ` / ${r.error}`;
        sent += r.sent;
        total = r.total;
        failed.push(...r.failed);
        setMailProgress({ sent, total });
        if (!r.hasMore) break;
        offset += 5;
      }
    } catch (e) {
      // 途中で止まった(通信の切断など)。それまでに送れた分は届いている
      return ` / メール${sent}/${total}件送信で中断しました(${e instanceof Error ? e.message : String(e)})`;
    } finally {
      setMailProgress(null);
    }
    return failed.length > 0
      ? ` / メール${sent}件送信、${failed.length}件失敗(${failed.join("、")})`
      : ` / メール${sent}件送信(管理者含む)`;
  }

  function applyTemplate() {
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("subject") as HTMLInputElement).value =
      REMINDER_TEMPLATE.subject;
    (form.elements.namedItem("body") as HTMLTextAreaElement).value =
      REMINDER_TEMPLATE.body;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">新規送信</h2>
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            setResult(null);
            setMailProgress(null);
            const res = await sendNotice(fd);
            if (!res.ok) {
              setResult(res);
              return;
            }
            formRef.current?.reset();
            setResult({ ok: true, message: res.message });
            if (res.broadcastMailId) {
              setResult({ ok: true, message: res.message + await sendBroadcastMails(res.broadcastMailId) });
            }
            router.refresh();
          })
        }
        className="mt-4 space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">宛先</label>
            <select name="recipient_id" className={inputClass}>
              <option value="">全員(一斉報知)</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employee_no}: {e.nickname?.trim() || e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">種別</label>
            <div className="flex gap-2">
              <select
                name="type"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "individual" | "reminder")
                }
                className={inputClass}
              >
                <option value="individual">連絡</option>
                <option value="reminder">入力催促</option>
              </select>
              {type === "reminder" && (
                <button
                  type="button"
                  onClick={applyTemplate}
                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  定型文
                </button>
              )}
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">件名</label>
          <input name="subject" required maxLength={100} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">本文</label>
          <textarea
            name="body"
            required
            rows={4}
            maxLength={2000}
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="send_email" className="h-4 w-4" />
          メールでも送信する
        </label>
        {result && (
          <p
            className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}
          >
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending
            ? mailProgress
              ? `メール送信中... ${mailProgress.sent}/${mailProgress.total}`
              : "送信中..."
            : "送信する"}
        </button>
      </form>
    </section>
  );
}
