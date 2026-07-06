import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/lib/auth";

export default async function NoticesPage() {
  const employee = await requireEmployee();
  const supabase = await createClient();

  const { data: notices } = await supabase
    .from("notifications")
    .select("id, type, subject, body, sent_at, recipient_id")
    .or(`recipient_id.eq.${employee.id},recipient_id.is.null`)
    .order("sent_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">お知らせ</h1>
      {(notices ?? []).length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          お知らせはありません
        </p>
      )}
      {(notices ?? []).map((n) => (
        <article key={n.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
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
                  ? "個別連絡"
                  : "全員"}
            </span>
            <time className="text-xs text-gray-400">
              {new Date(n.sent_at).toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          <h2 className="mt-2 font-semibold">{n.subject}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
            {n.body}
          </p>
        </article>
      ))}
    </div>
  );
}
