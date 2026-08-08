import { getAllowedStageTransitions } from "@/features/sales/pipeline";

export type PipelineMacroStage = {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  statusCodes: readonly string[];
};

export const PIPELINE_MACRO_STAGES: readonly PipelineMacroStage[] = [
  {
    key: "new",
    label: "Новые",
    shortLabel: "Новые",
    description: "Новые обращения и первичный разбор.",
    statusCodes: ["NEW_LEAD"],
  },
  {
    key: "qualification",
    label: "Квалификация",
    shortLabel: "Квалификация",
    description: "Контакт установлен, уточняем задачу и бюджет.",
    statusCodes: ["CONTACTED"],
  },
  {
    key: "consultation",
    label: "Консультация / замер",
    shortLabel: "Замер",
    description: "Назначение, выезд и фиксация размеров.",
    statusCodes: ["CONSULTATION_SCHEDULED", "CONSULTATION_COMPLETED", "SURVEY_COMPLETED"],
  },
  {
    key: "proposal",
    label: "Коммерческое предложение",
    shortLabel: "КП",
    description: "Подготовка и отправка предложения клиенту.",
    statusCodes: ["PROPOSAL_DRAFT", "PROPOSAL_SENT"],
  },
  {
    key: "decision",
    label: "Решение клиента",
    shortLabel: "Решение",
    description: "Правки, согласование и подписание договора.",
    statusCodes: ["APPROVED", "PROPOSAL_UPDATED_BY_CLIENT", "AGREEMENT_SIGNED"],
  },
  {
    key: "deposit",
    label: "Депозит / планирование",
    shortLabel: "Депозит",
    description: "Аванс, создание проекта и подготовка монтажа.",
    statusCodes: ["DEPOSIT_PENDING", "DEPOSIT_PAID", "PROJECT_CREATED"],
  },
  {
    key: "installation",
    label: "Монтаж",
    shortLabel: "Монтаж",
    description: "Назначено, в работе или завершено бригадой.",
    statusCodes: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"],
  },
  {
    key: "close",
    label: "Закрытие / aftercare",
    shortLabel: "Закрытие",
    description: "Финальная оплата, результат и гарантийный сервис.",
    statusCodes: ["FINAL_PAYMENT_PENDING", "PAID", "CLOSED_WON", "CLOSED_LOST", "WARRANTY_SERVICE"],
  },
] as const;

export const PIPELINE_STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: "Новый лид",
  CONTACTED: "Контакт установлен",
  CONSULTATION_SCHEDULED: "Консультация назначена",
  CONSULTATION_COMPLETED: "Консультация проведена",
  SURVEY_COMPLETED: "Замер завершён",
  PROPOSAL_DRAFT: "КП готовится",
  PROPOSAL_SENT: "КП отправлено",
  APPROVED: "КП одобрено",
  PROPOSAL_UPDATED_BY_CLIENT: "Правки клиента",
  AGREEMENT_SIGNED: "Договор подписан",
  DEPOSIT_PENDING: "Ожидаем депозит",
  DEPOSIT_PAID: "Депозит оплачен",
  PROJECT_CREATED: "Проект создан",
  SCHEDULED: "Монтаж назначен",
  IN_PROGRESS: "Монтаж идёт",
  COMPLETED: "Монтаж завершён",
  FINAL_PAYMENT_PENDING: "Ожидаем финальную оплату",
  PAID: "Оплачено",
  CLOSED_WON: "Успешно закрыто",
  CLOSED_LOST: "Сделка потеряна",
  WARRANTY_SERVICE: "Гарантийный сервис",
};

export const TERMINAL_PIPELINE_STATUSES = new Set(["CLOSED_WON", "CLOSED_LOST", "WARRANTY_SERVICE"]);

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
