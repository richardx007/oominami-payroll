"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendNotice } from "./actions";
import type { ActionResult } from "../employees/actions";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const REMINDER_TEMPLATE = {
  subject: "勤務表入力のお願い",
  body: "今月分の勤務表が未入力です。締め日(25日)までに入力をお願いします。",
};

export function NoticeForm({
  employees,
}: {
  employees: { id: string; name: string; employee_no: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"individual" | "reminder">("individual");

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
      <h2 className="font-semibold">新規送信</h2>
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            const res = await sendNotice(fd);
            setResult(res);
            if (res.ok) {
              formRef.current?.reset();
              router.refresh();
            }
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
                  {e.employee_no}: {e.name}
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
          {pending ? "送信中..." : "送信する"}
        </button>
      </form>
    </section>
  );
}
