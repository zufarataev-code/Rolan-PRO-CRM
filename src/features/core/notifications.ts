import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type NotificationSession = {
  user: {
    user_id: string;
  };
  roles: string[];
};

function toIsoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function getNotificationSummaryForSession(session: NotificationSession) {
  const unread = await prisma.notification.count({
    where: {
      recipient_user_id: session.user.user_id,
      is_read: false,
    },
  });

  return {
    unread,
  };
}

export async function listNotificationsForSession(session: NotificationSession, limit = 40) {
  const notifications = await prisma.notification.findMany({
    where: {
      recipient_user_id: session.user.user_id,
    },
    include: {
      actor_user: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
  });

  const now = new Date();
  const overdueTaskCount = session.roles.some((role) => role === ROLE_CODES.OWNER || role === ROLE_CODES.MANAGER)
    ? await prisma.task.count({
        where: {
          assigned_to: session.user.user_id,
          status: {
            in: ["open", "in_progress"],
          },
          due_at: {
            lt: now,
          },
        },
      })
    : 0;
  const overdueFollowUpCount = session.roles.some((role) => role === ROLE_CODES.OWNER || role === ROLE_CODES.MANAGER)
    ? await prisma.followUp.count({
        where: {
          assigned_to: session.user.user_id,
          status: "scheduled",
          due_at: {
            lt: now,
          },
        },
      })
    : 0;

  return {
    items: notifications.map((notification) => ({
      notification_id: notification.notification_id,
      type_key: notification.type_key,
      title: notification.title,
      message: notification.message,
      is_read: notification.is_read,
      is_new: !notification.is_read,
      created_at: notification.created_at,
      created_at_iso: notification.created_at.toISOString(),
      actor: notification.actor_user?.full_name ?? "Система",
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
    })),
    counters: {
      overdue_tasks: overdueTaskCount,
      overdue_follow_ups: overdueFollowUpCount,
    },
    generated_at: toIsoDate(now),
  };
}
