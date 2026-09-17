import { requireAdmin } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { PreviewView } from "./ui";

export default async function CalendarPreviewPage() {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PreviewView embedUrl={`${getSiteUrl()}/calendar/embed`} />
    </div>
  );
}
