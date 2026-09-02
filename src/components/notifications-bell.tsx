import Link from "next/link";

import { getAppSession } from "@/lib/auth/app-session";
import { getNotificationSummaryForSession } from "@/features/core/notifications";
import { notificationPathForRoles } from "@/lib/auth/canonical-route";

export async function NotificationsBell() {
  const session = await getAppSession();

  if (!session) {
    return null;
  }

  const summary = await getNotificationSummaryForSession(session);

  return (
    <Link href={notificationPathForRoles(session.roles)} className="soft-button">
      Уведомления
      {summary.unread > 0 ? <span className="chip chip-accent">{summary.unread} new</span> : null}
    </Link>
  );
}
