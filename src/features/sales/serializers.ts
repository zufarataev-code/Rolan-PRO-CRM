import type {
  Client,
  Deal,
  FollowUp,
  Lead,
  PipelineStatus,
  Project,
  Task,
} from "@prisma/client";

import { getAllowedStageTransitions } from "@/features/sales/pipeline";

function toNumber(value: { toString(): string } | null | undefined) {
  return value ? Number(value.toString()) : 0;
}

function isPastDue(value: Date | null | undefined) {
  return Boolean(value && value.getTime() < Date.now());
}

function isRecentlyCreated(value: Date | null | undefined, hours = 24) {
  return Boolean(value && Date.now() - value.getTime() <= hours * 60 * 60 * 1000);
}

export function serializeLead(lead: Lead & {
  pipeline_status: PipelineStatus;
  city: { name_ru: string; name_en: string } | null;
  assigned_manager: { user_id: string; full_name: string } | null;
}) {
  return {
    lead_id: lead.lead_id,
    lead_code: lead.lead_code,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    notes: lead.notes,
    city: lead.city,
    assigned_manager: lead.assigned_manager,
    pipeline_status: {
      pipeline_status_id: lead.pipeline_status.pipeline_status_id,
      status_code: lead.pipeline_status.status_code,
      name_ru: lead.pipeline_status.name_ru,
      name_en: lead.pipeline_status.name_en,
      color_token: lead.pipeline_status.color_token,
    },
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    status_flags: {
      is_new: isRecentlyCreated(lead.created_at),
    },
  };
}

export function serializeClient(client: Client & {
  city: { name_ru: string; name_en: string } | null;
  _count?: { deals: number; projects: number };
}) {
  return {
    client_id: client.client_id,
    client_code: client.client_code,
    name: client.name,
    phone: client.phone,
    email: client.email,
    billing_address: client.billing_address,
    service_address: client.service_address,
    zip_code: client.zip_code,
    city: client.city,
    counts: client._count ?? {
      deals: 0,
      projects: 0,
    },
    created_at: client.created_at,
    updated_at: client.updated_at,
  };
}

export function serializeFollowUp(
  followUp: FollowUp & {
    assigned_to_user: { user_id: string; full_name: string } | null;
    created_by_user: { user_id: string; full_name: string };
  },
) {
  return {
    follow_up_id: followUp.follow_up_id,
    lead_id: followUp.lead_id,
    deal_id: followUp.deal_id,
    type_key: followUp.type_key,
    status: followUp.status,
    due_at: followUp.due_at,
    notes: followUp.notes,
    outcome: followUp.outcome,
    assigned_to: followUp.assigned_to_user,
    created_by: followUp.created_by_user,
    completed_at: followUp.completed_at,
    created_at: followUp.created_at,
    is_overdue: followUp.status === "scheduled" && isPastDue(followUp.due_at),
  };
}

export function serializeTask(
  task: Task & {
    assigned_to_user: { user_id: string; full_name: string } | null;
    created_by_user: { user_id: string; full_name: string };
  },
) {
  return {
    task_id: task.task_id,
    lead_id: task.lead_id,
    deal_id: task.deal_id,
    entity_type: task.entity_type,
    entity_id: task.entity_id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_at: task.due_at,
    assigned_to: task.assigned_to_user,
    created_by: task.created_by_user,
    completed_at: task.completed_at,
    created_at: task.created_at,
    is_overdue: isOpenTaskStatus(task.status) && isPastDue(task.due_at),
  };
}

export function serializeDealCard(
  deal: Deal & {
    lead: Lead | null;
    client: Client | null;
    pipeline_status: PipelineStatus;
    assigned_manager: { user_id: string; full_name: string } | null;
    follow_ups: (FollowUp & {
      assigned_to_user: { user_id: string; full_name: string } | null;
    })[];
    tasks: (Task & {
      assigned_to_user?: { user_id: string; full_name: string } | null;
      created_by_user?: { user_id: string; full_name: string };
    })[];
    projects: Project[];
    _count?: { follow_ups: number; tasks: number; projects: number };
  },
) {
  const overdueFollowUps = deal.follow_ups.filter((item) => item.status === "scheduled" && isPastDue(item.due_at));
  const overdueTasks = deal.tasks.filter(
    (item) => item.status !== "done" && item.status !== "canceled" && isPastDue(item.due_at),
  );
  const nextFollowUp = [...deal.follow_ups]
    .sort((a, b) => a.due_at.getTime() - b.due_at.getTime())
    .find((item) => item.status === "scheduled");

  return {
    deal_id: deal.deal_id,
    deal_code: deal.deal_code,
    title: deal.title,
    estimated_value: toNumber(deal.estimated_value),
    currency: deal.currency,
    notes: deal.notes,
    lead: deal.lead
      ? {
          lead_id: deal.lead.lead_id,
          lead_code: deal.lead.lead_code,
          name: deal.lead.name,
          phone: deal.lead.phone,
          email: deal.lead.email,
          source: deal.lead.source,
        }
      : null,
    client: deal.client
      ? {
          client_id: deal.client.client_id,
          name: deal.client.name,
          phone: deal.client.phone,
          email: deal.client.email,
          service_address: deal.client.service_address,
          billing_address: deal.client.billing_address,
        }
      : null,
    assigned_manager: deal.assigned_manager,
    pipeline_status: {
      pipeline_status_id: deal.pipeline_status.pipeline_status_id,
      status_code: deal.pipeline_status.status_code,
      name_ru: deal.pipeline_status.name_ru,
      name_en: deal.pipeline_status.name_en,
      color_token: deal.pipeline_status.color_token,
    },
    allowed_next: getAllowedStageTransitions(deal.pipeline_status.status_code),
    next_follow_up: nextFollowUp
      ? {
          follow_up_id: nextFollowUp.follow_up_id,
          type_key: nextFollowUp.type_key,
          due_at: nextFollowUp.due_at,
          assigned_to: nextFollowUp.assigned_to_user,
        }
      : null,
    task_summary: {
      total: deal._count?.tasks ?? deal.tasks.length,
      open: deal.tasks.filter((task) => task.status !== "done" && task.status !== "canceled").length,
    },
    project_summary: {
      total: deal._count?.projects ?? deal.projects.length,
    },
    follow_up_summary: {
      total: deal._count?.follow_ups ?? deal.follow_ups.length,
    },
    status_flags: {
      is_new: isRecentlyCreated(deal.created_at),
      overdue_follow_ups: overdueFollowUps.length,
      overdue_tasks: overdueTasks.length,
      needs_attention: overdueFollowUps.length > 0 || overdueTasks.length > 0,
    },
    follow_ups: deal.follow_ups.map((followUp) => ({
      follow_up_id: followUp.follow_up_id,
      type_key: followUp.type_key,
      status: followUp.status,
      due_at: followUp.due_at,
      notes: followUp.notes,
      outcome: followUp.outcome,
      assigned_to: followUp.assigned_to_user,
      completed_at: followUp.completed_at,
      created_at: followUp.created_at,
      is_overdue: followUp.status === "scheduled" && isPastDue(followUp.due_at),
    })),
    tasks: deal.tasks.map((task) => ({
      task_id: task.task_id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_at: task.due_at,
      completed_at: task.completed_at,
      assigned_to:
        "assigned_to_user" in task
          ? task.assigned_to_user ?? null
          : null,
      created_by:
        "created_by_user" in task
          ? task.created_by_user ?? null
          : null,
      created_at: task.created_at,
      is_overdue: task.status !== "done" && task.status !== "canceled" && isPastDue(task.due_at),
    })),
    projects: deal.projects.map((project) => ({
      project_id: project.project_id,
      project_code: project.project_code,
      title: project.title,
      install_date: project.install_date,
    })),
    created_at: deal.created_at,
    updated_at: deal.updated_at,
  };
}

function isOpenTaskStatus(status: string) {
  return status !== "done" && status !== "canceled";
}
