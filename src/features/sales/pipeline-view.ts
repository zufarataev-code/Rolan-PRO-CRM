import { getAllowedStageTransitions } from "@/features/sales/pipeline";

export type PipelineMacroStage = {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  statusCodes: readonly string[];
};

/**
 * The visible board is SALES only. Project execution has its own statuses,
 * phases, dates and installers after the explicit project launch.
 */
export const PIPELINE_MACRO_STAGES: readonly PipelineMacroStage[] = [
  {
    key: "new",
    label: "Новые лиды",
    shortLabel: "Лиды",
    description: "Новое обращение — ещё не проект.",
    statusCodes: ["NEW_LEAD"],
  },
  {
    key: "qualification",
    label: "Контакт",
    shortLabel: "Контакт",
    description: "Связались, уточняем задачу и следующий шаг.",
    statusCodes: ["CONTACTED"],
  },
  {
    key: "survey",
    label: "Замер",
    shortLabel: "Замер",
    description: "Назначение, выезд и фиксация размеров.",
    statusCodes: ["CONSULTATION_SCHEDULED", "CONSULTATION_COMPLETED", "SURVEY_COMPLETED"],
  },
  {
    key: "proposal",
    label: "КП",
    shortLabel: "КП",
    description: "Быстрый расчёт, подготовка и отправка коммерческого предложения.",
    statusCodes: ["PROPOSAL_DRAFT", "PROPOSAL_SENT", "PROPOSAL_UPDATED_BY_CLIENT", "APPROVED"],
  },
  {
    key: "agreement",
    label: "Договор",
    shortLabel: "Договор",
    description: "Согласование и подпись договора клиентом.",
    statusCodes: ["AGREEMENT_SIGNED"],
  },
  {
    key: "deposit",
    label: "Аванс",
    shortLabel: "Аванс",
    description: "Ожидаем и фиксируем обязательный аванс.",
    statusCodes: ["DEPOSIT_PENDING", "DEPOSIT_PAID"],
  },
  {
    key: "closed",
    label: "Результат",
    shortLabel: "Результат",
    description: "CLOSED WON после договора + аванса или закрытая потерянная сделка.",
    statusCodes: ["CLOSED_WON", "CLOSED_LOST"],
  },
] as const;

export const PIPELINE_STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: "Новый лид",
  CONTACTED: "Контакт установлен",
  CONSULTATION_SCHEDULED: "Замер назначен",
  CONSULTATION_COMPLETED: "Выезд проведён",
  SURVEY_COMPLETED: "Замер завершён",
  PROPOSAL_DRAFT: "КП готовится",
  PROPOSAL_SENT: "КП отправлено",
  APPROVED: "КП согласовано",
  PROPOSAL_UPDATED_BY_CLIENT: "Правки клиента",
  AGREEMENT_SIGNED: "Договор подписан",
  DEPOSIT_PENDING: "Ожидаем аванс",
  DEPOSIT_PAID: "Аванс оплачен",
  CLOSED_WON: "Продажа закрыта",
  CLOSED_LOST: "Сделка потеряна",

  // Historical labels remain readable, but these statuses are not columns in
  // the sales funnel anymore.
  PROJECT_CREATED: "Проект создан",
  SCHEDULED: "Монтаж назначен",
  IN_PROGRESS: "Монтаж идёт",
  COMPLETED: "Монтаж завершён",
  FINAL_PAYMENT_PENDING: "Ожидаем финальную оплату",
  PAID: "Оплачено",
  WARRANTY_SERVICE: "Гарантийный сервис",
};

export const TERMINAL_PIPELINE_STATUSES = new Set(["CLOSED_WON", "CLOSED_LOST"]);

export function getPipelineStatusLabel(statusCode: string) {
  return PIPELINE_STATUS_LABELS[statusCode] ?? statusCode;
}

export function getMacroStageForStatus(statusCode: string) {
  return PIPELINE_MACRO_STAGES.find((stage) => stage.statusCodes.includes(statusCode));
}

export function getAllowedTargetStatuses(statusCode: string, targetMacroStageKey: string) {
  const targetStage = PIPELINE_MACRO_STAGES.find((stage) => stage.key === targetMacroStageKey);
  if (!targetStage) {
    return [];
  }

  return getAllowedStageTransitions(statusCode).filter((nextStatus) => targetStage.statusCodes.includes(nextStatus));
}
