import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { NoticeForm } from "./ui";

export default async function AdminNoticesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: employees }, { data: notices }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, employee_no")
      .eq("status", "active")
      .eq("is_admin", false)
      .order("employee_no"),
    supabase
      .from("notifications")
      .select(
        "id, type, subject, body, sent_at, recipient_id, recipient:employees!notifications_recipient_id_fkey ( name )"
      )
      .order("sent_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">連絡・催促</h1>
        <p className="mt-1 text-sm text-gray-500">
          個別連絡・入力催促・全員への一斉報知を送れます(アプリ内お知らせに表示)
        </p>
      </div>

      <NoticeForm employees={employees ?? []} />

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h2 className="font-semibold">送信履歴</h2>
        </div>
        <ul className="divide-y divide-gray-50">
          {(notices ?? []).map((n) => {
            const recipient = n.recipient as unknown as {
              name: string;
            } | null;
            return (
              <li key={n.id} className="p-4 text-sm">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      n.type === "reminder"
                        ? "bg-amber-50 text-amber-700"
                        : n.recipient_id
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {n.type === "reminder"
                      ? "催促"
                      : n.recipient_id
                        ? "個別"
                        : "全員"}
                  </span>
                  <span className="text-gray-500">
                    宛先: {recipient?.name ?? "全員"}
                  </span>
                  <time className="text-gray-400">
                    {new Date(n.sent_at).toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <div className="mt-1 font-medium">{n.subject}</div>
                <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-gray-500">
                  {n.body}
                </p>
              </li>
            );
          })}
          {(notices ?? []).length === 0 && (
            <li className="p-8 text-center text-sm text-gray-400">
              送信履歴はありません
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
