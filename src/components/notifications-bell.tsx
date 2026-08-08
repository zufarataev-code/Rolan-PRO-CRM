import Link from "next/link";

import { getAppSession } from "@/lib/auth/app-session";
import { getNotificationSummaryForSession } from "@/features/core/notifications";

export async function NotificationsBell() {
  const session = await getAppSession();

  if (!session) {
    return null;
  }

  const summary = await getNotificationSummaryForSession(session);

  return (
    <Link href="/notifications" className="soft-button">
      Уведомления
      {summary.unread > 0 ? <span className="chip chip-accent">{summary.unread} new</span> : null}
    </Link>
  );
}
