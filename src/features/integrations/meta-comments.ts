import { createHmac } from "node:crypto";

import { Prisma } from "@prisma/client";

import { onLeadCreated } from "@/features/core/events";
import {
  resolveFacebookMessengerActorAndManager,
  type FacebookMessengerDbClient,
} from "@/features/integrations/facebook-messenger-db";
import { parseAnthropicRequest, requestAnthropicMessage } from "@/lib/anthropic/client";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

import {
  FACEBOOK_COMMENT_ACTION,
  FACEBOOK_COMMENT_SOURCE,
  MetaCommentError,
  classifyFacebookComment,
  facebookCommentDueAt,
  facebookCommentPayloadHash,
  facebookCommentStatusesForQuery,
  facebookCommentTaskTitle,
  fallbackFacebookCommentDraft,
  metaObjectId,
  metaGraphFailureIsDefinite,
  parseFacebookCommentAiResponse,
  type FacebookCommentIntent,
  type MetaCommentNotification,
} from "./meta-comments-core";

const GRAPH_VERSION_FALLBACK = "v26.0";

export function metaCommentConfig() {
  // This callback is shared with Lead Ads, therefore an existing Lead Ads app
  // remains authoritative. META_COMMENTS_* is a fallback for comment-only
  // installations, not a way to mix two app signatures on one callback.
  const appSecret = process.env.META_LEAD_ADS_APP_SECRET?.trim()
    || process.env.META_COMMENTS_APP_SECRET?.trim()
    || "";
  const pageAccessToken = process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN?.trim()
    || process.env.META_COMMENTS_PAGE_ACCESS_TOKEN?.trim()
    || "";
  const pageId = process.env.META_LEAD_ADS_PAGE_ID?.trim()
    || process.env.META_COMMENTS_PAGE_ID?.trim()
    || "";
  const verifyToken = process.env.META_LEAD_ADS_VERIFY_TOKEN?.trim()
    || process.env.META_COMMENTS_VERIFY_TOKEN?.trim()
    || "";
  const requestedVersion = process.env.META_GRAPH_API_VERSION?.trim() || GRAPH_VERSION_FALLBACK;
  const graphVersion = /^v\d{1,2}\.\d$/.test(requestedVersion) ? requestedVersion : GRAPH_VERSION_FALLBACK;
  return {
    appSecret,
    pageAccessToken,
    pageId,
    verifyToken,
    graphVersion,
    webhookConfigured: Boolean(appSecret && pageId && verifyToken),
    publishingConfigured: Boolean(appSecret && pageAccessToken && pageId),
  };
}

function commentStatus(intent: FacebookCommentIntent) {
  if (intent === "spam") return "dismissed" as const;
  if (intent === "complaint") return "escalated" as const;
  return "pending_review" as const;
}

function taskPriority(intent: FacebookCommentIntent) {
  if (intent === "complaint") return "urgent";
  if (intent === "sales") return "high";
  return "normal";
}

export async function ingestMetaComment(notification: MetaCommentNotification) {
  const payloadHash = facebookCommentPayloadHash(notification);
  return prisma.$transaction(async (tx: FacebookMessengerDbClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('meta-facebook-comment'), hashtext(${notification.comment_id}))`;
    const existing = await tx.facebookComment.findUnique({
      where: {
        page_id_external_comment_id: {
          page_id: notification.page_id,
          external_comment_id: notification.comment_id,
        },
      },
      select: { facebook_comment_id: true, metadata: true },
    });
    if (existing) {
      const existingHash = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>).payload_hash
        : null;
      if (existingHash && existingHash !== payloadHash) {
        throw new MetaCommentError("comment_payload_conflict", 409, "A comment retry changed its signed payload.");
      }
      return { facebook_comment_id: existing.facebook_comment_id, duplicate: true };
    }

    const { actor, manager } = await resolveFacebookMessengerActorAndManager(tx);
    const intent = classifyFacebookComment(notification.message);
    const status = commentStatus(intent);
    const dueAt = intent === "spam" ? null : facebookCommentDueAt(intent, notification.commented_at);
    const comment = await tx.facebookComment.create({
      data: {
        page_id: notification.page_id,
        external_comment_id: notification.comment_id,
        post_id: notification.post_id,
        parent_comment_id: notification.parent_comment_id,
        author_id: notification.author_id,
        author_name: notification.author_name,
        message: notification.message,
        intent,
        status,
        draft_reply: fallbackFacebookCommentDraft(notification.message, intent),
        permalink_url: notification.permalink_url,
        assigned_to: manager.user_id,
        due_at: dueAt,
        commented_at: notification.commented_at,
        dismissed_at: status === "dismissed" ? new Date() : null,
        metadata: {
          ...notification.metadata,
          payload_hash: payloadHash,
          external_author_hash: createHmac("sha256", notification.page_id)
            .update(notification.author_id)
            .digest("hex"),
        },
      },
      select: { facebook_comment_id: true },
    });

    await tx.activityLog.create({
      data: {
        actor_user_id: actor.user_id,
        entity_type: "facebook_comment",
        entity_id: comment.facebook_comment_id,
        action_key: FACEBOOK_COMMENT_ACTION,
        message: `Facebook comment received from ${notification.author_name}.`,
        metadata: {
          page_id: notification.page_id,
          post_id: notification.post_id,
          comment_id: notification.comment_id,
          intent,
          status,
        },
      },
    });

    if (status !== "dismissed") {
      await tx.task.create({
        data: {
          entity_type: "facebook_comment",
          entity_id: comment.facebook_comment_id,
          title: facebookCommentTaskTitle(intent, notification.author_name),
          description: notification.message || "Комментарий без текста — проверьте вложение в Facebook.",
          status: "open",
          priority: taskPriority(intent),
          due_at: dueAt,
          assigned_to: manager.user_id,
          created_by: actor.user_id,
        },
      });
      await tx.notification.create({
        data: {
          recipient_user_id: manager.user_id,
          actor_user_id: actor.user_id,
          entity_type: "facebook_comment",
          entity_id: comment.facebook_comment_id,
          type_key: intent === "complaint" ? "facebook.comment.complaint" : "facebook.comment.received",
          title: intent === "complaint" ? "Жалоба в Facebook" : "Новый комментарий в Facebook",
          message: `${notification.author_name}: ${notification.message || "комментарий без текста"}`.slice(0, 1_000),
        },
      });
    }

    return { facebook_comment_id: comment.facebook_comment_id, duplicate: false };
  });
}

export function facebookCommentAccessWhere(commentId: string, managerId?: string) {
  return {
    facebook_comment_id: commentId,
    ...(managerId ? { assigned_to: managerId } : {}),
  } satisfies Prisma.FacebookCommentWhereInput;
}

export async function listFacebookComments(input: {
  managerId?: string;
  status?: string | null;
  limit?: number;
}) {
  const statuses = facebookCommentStatusesForQuery(input.status);
  const items = await prisma.facebookComment.findMany({
    where: {
      ...(input.managerId ? { assigned_to: input.managerId } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: {
      assignee: { select: { user_id: true, full_name: true } },
      lead: { select: { lead_id: true, lead_code: true, name: true } },
    },
    orderBy: [{ due_at: "asc" }, { commented_at: "desc" }],
    take: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });
  return items.map((item) => ({
    facebook_comment_id: item.facebook_comment_id,
    page_id: item.page_id,
    external_comment_id: item.external_comment_id,
    post_id: item.post_id,
    parent_comment_id: item.parent_comment_id,
    author_name: item.author_name,
    message: item.message,
    intent: item.intent,
    status: item.status,
    draft_reply: item.draft_reply,
    published_reply_text: item.published_reply_text,
    permalink_url: item.permalink_url,
    assignee: item.assignee,
    lead: item.lead,
    due_at: item.due_at,
    commented_at: item.commented_at,
    replied_at: item.replied_at,
  }));
}

export async function generateFacebookCommentDraft(input: {
  commentId: string;
  managerId?: string;
  actorUserId: string;
}) {
  const comment = await prisma.facebookComment.findFirst({
    where: facebookCommentAccessWhere(input.commentId, input.managerId),
  });
  if (!comment) throw new MetaCommentError("not_found", 404, "Facebook comment was not found.");
  if (comment.status === "replied" || comment.status === "dismissed") {
    throw new MetaCommentError("comment_closed", 409, "This Facebook comment is already closed.");
  }
  if (comment.status === "publishing") {
    throw new MetaCommentError("reply_in_progress", 409, "A Facebook reply is already being published.");
  }
  if (comment.status !== "pending_review" && comment.status !== "escalated") {
    throw new MetaCommentError("comment_changed", 409, "This Facebook comment changed. Refresh it before generating a draft.");
  }

  let intent = classifyFacebookComment(comment.message);
  let reply: string | null = fallbackFacebookCommentDraft(comment.message, intent);
  let generatedBy = "safe_fallback";
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || "";

  if (apiKey.startsWith("sk-ant-")) {
    try {
      const request = parseAnthropicRequest({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 450,
        system: [
          "You draft short public Facebook comment replies for Rolan PRO, a professional window-film company serving Southern California.",
          "Reply in the comment's language. Sound warm, specific and human. Use one to three short sentences.",
          "Never invent a price, discount, availability, warranty, technical specification or appointment. Never ask for phone/email publicly.",
          "For buying interest, invite the person to send a private message with ZIP code and project details.",
          "For a complaint, apologize without admitting liability and ask for a private message so a manager can investigate.",
          "Return only JSON: {\"intent\":\"sales|question|complaint|praise|spam|other\",\"reply\":\"...\"}.",
        ].join("\n"),
        messages: [{ role: "user", content: JSON.stringify({ author: comment.author_name, comment: comment.message }) }],
      });
      const parsed = parseFacebookCommentAiResponse(await requestAnthropicMessage(apiKey, request));
      intent = parsed.intent;
      reply = parsed.reply;
      generatedBy = "anthropic";
    } catch {
      // A public reply must never be blocked by an AI outage. Keep the safe draft.
    }
  }
  if (intent === "spam") reply = null;
  if (!reply && intent !== "spam") {
    throw new MetaCommentError("no_reply", 409, "A safe Facebook reply draft could not be generated.");
  }

  const status = commentStatus(intent);
  const now = new Date();
  const dueAt = intent === "spam" ? null : facebookCommentDueAt(intent, comment.commented_at);
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.facebookComment.updateMany({
      where: {
        facebook_comment_id: comment.facebook_comment_id,
        status: comment.status,
      },
      data: {
        intent,
        status,
        draft_reply: reply,
        due_at: dueAt,
        dismissed_at: status === "dismissed" ? now : null,
      },
    });
    if (claimed.count !== 1) {
      throw new MetaCommentError("comment_changed", 409, "This Facebook comment changed while the draft was being generated.");
    }
    const saved = await tx.facebookComment.findUniqueOrThrow({
      where: { facebook_comment_id: comment.facebook_comment_id },
      select: { facebook_comment_id: true, intent: true, status: true, draft_reply: true },
    });
    await tx.task.updateMany({
      where: {
        entity_type: "facebook_comment",
        entity_id: comment.facebook_comment_id,
        status: { in: ["open", "in_progress"] },
      },
      data: status === "dismissed"
        ? { status: "done", completed_at: now }
        : { priority: taskPriority(intent), due_at: dueAt, status: "open", completed_at: null },
    });
    if (intent === "complaint" && comment.intent !== "complaint" && comment.assigned_to) {
      await tx.notification.create({
        data: {
          recipient_user_id: comment.assigned_to,
          actor_user_id: input.actorUserId,
          entity_type: "facebook_comment",
          entity_id: comment.facebook_comment_id,
          type_key: "facebook.comment.complaint",
          title: "Комментарий Facebook требует срочного ответа",
          message: `${comment.author_name}: ${comment.message || "комментарий без текста"}`.slice(0, 1_000),
        },
      });
    }
    await tx.activityLog.create({
      data: {
        actor_user_id: input.actorUserId,
        entity_type: "facebook_comment",
        entity_id: comment.facebook_comment_id,
        action_key: "integration.facebook_comment.draft_generated",
        message: intent === "spam"
          ? "Facebook comment classified as spam and dismissed."
          : `Facebook reply draft generated by ${generatedBy}.`,
        metadata: { generated_by: generatedBy, intent, status },
      },
    });
    return saved;
  });
  return { ...updated, generated_by: generatedBy };
}

export async function updateFacebookComment(input: {
  commentId: string;
  managerId?: string;
  actorUserId: string;
  action: "dismiss" | "reopen";
}) {
  const current = await prisma.facebookComment.findFirst({
    where: facebookCommentAccessWhere(input.commentId, input.managerId),
    select: {
      facebook_comment_id: true,
      status: true,
      intent: true,
      author_name: true,
      message: true,
      assigned_to: true,
    },
  });
  if (!current) throw new MetaCommentError("not_found", 404, "Facebook comment was not found.");
  if (current.status === "replied") throw new MetaCommentError("comment_closed", 409, "A replied comment cannot be reopened or dismissed.");
  if (current.status === "publishing") throw new MetaCommentError("reply_in_progress", 409, "A Facebook reply is already being published.");
  const status = input.action === "dismiss" ? "dismissed" : "pending_review";
  const now = new Date();
  const dueAt = input.action === "reopen"
    ? facebookCommentDueAt(current.intent as FacebookCommentIntent, now)
    : null;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.facebookComment.updateMany({
      where: {
        facebook_comment_id: current.facebook_comment_id,
        status: current.status,
      },
      data: {
        status,
        due_at: dueAt,
        dismissed_at: status === "dismissed" ? now : null,
      },
    });
    if (claimed.count !== 1) {
      throw new MetaCommentError("comment_changed", 409, "This Facebook comment changed. Refresh it before updating.");
    }
    const tasks = await tx.task.updateMany({
      where: {
        entity_type: "facebook_comment",
        entity_id: current.facebook_comment_id,
        status: { in: ["open", "in_progress", "done"] },
      },
      data: status === "dismissed"
        ? { status: "done", completed_at: now }
        : { status: "open", priority: taskPriority(current.intent as FacebookCommentIntent), due_at: dueAt, completed_at: null },
    });
    if (input.action === "reopen" && tasks.count === 0) {
      await tx.task.create({
        data: {
          entity_type: "facebook_comment",
          entity_id: current.facebook_comment_id,
            title: facebookCommentTaskTitle(current.intent as FacebookCommentIntent, current.author_name),
          description: current.message || "Комментарий без текста — проверьте вложение в Facebook.",
          status: "open",
          priority: taskPriority(current.intent as FacebookCommentIntent),
          due_at: dueAt,
          assigned_to: current.assigned_to,
          created_by: input.actorUserId,
        },
      });
    }
    await tx.activityLog.create({
      data: {
        actor_user_id: input.actorUserId,
        entity_type: "facebook_comment",
        entity_id: current.facebook_comment_id,
        action_key: `integration.facebook_comment.${input.action}`,
        message: `Facebook comment ${input.action === "dismiss" ? "dismissed" : "reopened"}.`,
      },
    });
  });
  return { facebook_comment_id: current.facebook_comment_id, status };
}

export async function createLeadFromFacebookComment(input: {
  commentId: string;
  managerId?: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('meta-facebook-comment-lead'), hashtext(${input.commentId}))`;
    const comment = await tx.facebookComment.findFirst({
      where: facebookCommentAccessWhere(input.commentId, input.managerId),
    });
    if (!comment) throw new MetaCommentError("not_found", 404, "Facebook comment was not found.");
    if (comment.lead_id) return { lead_id: comment.lead_id, duplicate: true };

    const duplicate = await tx.lead.findUnique({
      where: {
        external_source_external_submission_id: {
          external_source: FACEBOOK_COMMENT_SOURCE,
          external_submission_id: comment.external_comment_id,
        },
      },
      select: { lead_id: true },
    });
    if (duplicate) {
      await tx.facebookComment.update({
        where: { facebook_comment_id: comment.facebook_comment_id },
        data: { lead_id: duplicate.lead_id },
      });
      return { lead_id: duplicate.lead_id, duplicate: true };
    }

    const status = await tx.pipelineStatus.findFirst({
      where: { status_code: { in: ["NEW_LEAD", "LEAD"] } },
      orderBy: { sort_order: "asc" },
      select: { pipeline_status_id: true },
    });
    if (!status) throw new MetaCommentError("missing_pipeline_status", 503, "Pipeline status for a new lead is missing.");
    const managerUserId = comment.assigned_to || input.actorUserId;
    const lead = await tx.lead.create({
      data: {
        name: comment.author_name,
        source: FACEBOOK_COMMENT_SOURCE,
        external_source: FACEBOOK_COMMENT_SOURCE,
        external_submission_id: comment.external_comment_id,
        pipeline_status_id: status.pipeline_status_id,
        assigned_manager_id: managerUserId,
        notes: [
          "Facebook Page comment",
          `Post: ${comment.post_id}`,
          `Comment: ${comment.message || "(without text)"}`,
          "Next action: approve the public reply and move the conversation to Messenger.",
        ].join("\n"),
      },
      select: { lead_id: true, name: true },
    });
    await tx.facebookComment.update({
      where: { facebook_comment_id: comment.facebook_comment_id },
      data: { lead_id: lead.lead_id },
    });
    await tx.task.updateMany({
      where: { entity_type: "facebook_comment", entity_id: comment.facebook_comment_id, status: { in: ["open", "in_progress"] } },
      data: { lead_id: lead.lead_id, assigned_to: managerUserId },
    });
    await onLeadCreated(tx, {
      actorUserId: input.actorUserId,
      leadId: lead.lead_id,
      managerUserId,
      leadNameOrTitle: lead.name,
    });
    await tx.activityLog.create({
      data: {
        actor_user_id: input.actorUserId,
        entity_type: "facebook_comment",
        entity_id: comment.facebook_comment_id,
        action_key: "integration.facebook_comment.lead_created",
        message: `Lead created from Facebook comment by ${comment.author_name}.`,
        metadata: { lead_id: lead.lead_id },
      },
    });
    return { lead_id: lead.lead_id, duplicate: false };
  });
}

export async function publishFacebookCommentReply(input: {
  commentId: string;
  managerId?: string;
  actorUserId: string;
  message: string;
}) {
  const message = input.message.trim();
  if (!message || message.length > 2_000 || message.includes("\u0000")) {
    throw new MetaCommentError("invalid_reply", 400, "Reply must contain between 1 and 2,000 characters.");
  }
  const comment = await prisma.facebookComment.findFirst({
    where: facebookCommentAccessWhere(input.commentId, input.managerId),
  });
  if (!comment) throw new MetaCommentError("not_found", 404, "Facebook comment was not found.");
  if (comment.status === "replied") {
    return { facebook_comment_id: comment.facebook_comment_id, status: "replied", duplicate: true };
  }
  if (comment.status === "dismissed") throw new MetaCommentError("comment_closed", 409, "Dismissed comments must be reopened before replying.");
  if (comment.status === "publishing") throw new MetaCommentError("reply_in_progress", 409, "A Facebook reply is already being published.");
  if (comment.status !== "pending_review" && comment.status !== "escalated") {
    throw new MetaCommentError("comment_closed", 409, "This Facebook comment is not ready for a public reply.");
  }

  const config = metaCommentConfig();
  if (!config.publishingConfigured || comment.page_id !== config.pageId) {
    throw new MetaCommentError("integration_not_configured", 503, "Facebook comment publishing is not configured.");
  }
  metaObjectId(comment.external_comment_id, "comment_id");
  const claim = await prisma.facebookComment.updateMany({
    where: {
      ...facebookCommentAccessWhere(input.commentId, input.managerId),
      status: comment.status,
    },
    data: { status: "publishing" },
  });
  if (claim.count !== 1) {
    const latest = await prisma.facebookComment.findFirst({
      where: facebookCommentAccessWhere(input.commentId, input.managerId),
      select: { status: true },
    });
    if (latest?.status === "replied") {
      return { facebook_comment_id: comment.facebook_comment_id, status: "replied", duplicate: true };
    }
    if (latest?.status === "publishing") {
      throw new MetaCommentError("reply_in_progress", 409, "A Facebook reply is already being published.");
    }
    throw new MetaCommentError("comment_changed", 409, "This Facebook comment changed. Refresh it before publishing.");
  }
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${comment.external_comment_id}/comments`);
  url.searchParams.set("appsecret_proof", createHmac("sha256", config.appSecret).update(config.pageAccessToken).digest("hex"));
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.pageAccessToken}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // A timeout/network failure is ambiguous: Facebook may have accepted the
    // reply. Keep the durable `publishing` claim so a retry cannot duplicate it.
    throw new MetaCommentError("facebook_publish_uncertain", 502, "Facebook reply status is uncertain and needs reconciliation.");
  }
  const result = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!response.ok) {
    if (!metaGraphFailureIsDefinite(response.status)) {
      // A server, timeout or throttling response is ambiguous: Facebook may
      // already have applied the write before the error reached us.
      throw new MetaCommentError("facebook_publish_uncertain", 502, "Facebook reply status is uncertain and needs reconciliation.");
    }
    // An explicit client-side Graph rejection is safe to retry after restoring
    // the review state.
    await prisma.facebookComment.updateMany({
      where: { facebook_comment_id: comment.facebook_comment_id, status: "publishing" },
      data: { status: comment.status },
    });
    throw new MetaCommentError("facebook_publish_failed", 502, "Facebook did not publish the reply.");
  }
  if (typeof result?.id !== "string") {
    // A success response without a usable id is also ambiguous; keep claimed.
    throw new MetaCommentError("facebook_publish_uncertain", 502, "Facebook reply status is uncertain and needs reconciliation.");
  }
  const publishedReplyId = metaObjectId(result.id, "reply_id");
  const now = new Date();
  await prisma.$transaction([
    prisma.facebookComment.update({
      where: { facebook_comment_id: comment.facebook_comment_id },
      data: {
        status: "replied",
        draft_reply: message,
        published_reply_id: publishedReplyId,
        published_reply_text: message,
        replied_at: now,
      },
    }),
    prisma.task.updateMany({
      where: { entity_type: "facebook_comment", entity_id: comment.facebook_comment_id, status: { in: ["open", "in_progress"] } },
      data: { status: "done", completed_at: now },
    }),
    prisma.activityLog.create({
      data: {
        actor_user_id: input.actorUserId,
        entity_type: "facebook_comment",
        entity_id: comment.facebook_comment_id,
        action_key: "integration.facebook_comment.replied",
        message: "Facebook comment reply approved and published.",
        metadata: { reply_id: publishedReplyId },
      },
    }),
  ]);
  return { facebook_comment_id: comment.facebook_comment_id, status: "replied", duplicate: false };
}

export function metaCommentManagerScope(session: { user: { user_id: string }; roles: string[] }) {
  return session.roles.includes(ROLE_CODES.OWNER) ? undefined : session.user.user_id;
}
