export const LEAD_STAGES = [
  { code: "NEW_LEAD", name: "Новый лид", closed: false, manual: true },
  { code: "CONTACTING", name: "Пытаемся связаться", closed: false, manual: true },
  { code: "CONTACTED", name: "Контакт установлен", closed: false, manual: true },
  { code: "QUALIFIED", name: "Квалифицирован", closed: false, manual: true },
  { code: "PROJECT_CREATED", name: "Проект создан", closed: false, manual: false },
  { code: "CONSULTATION_SCHEDULED", name: "Консультация назначена", closed: false, manual: false },
  { code: "CONSULTATION_COMPLETED", name: "Консультация проведена", closed: false, manual: false },
  { code: "SURVEY_COMPLETED", name: "Замер завершён", closed: false, manual: false },
  { code: "PROPOSAL_SENT", name: "КП отправлено", closed: false, manual: false },
  { code: "CLOSED_WON", name: "Конвертирован — продажа", closed: true, manual: false },
  { code: "DISQUALIFIED", name: "Не квалифицирован", closed: true, manual: true },
  { code: "CLOSED_LOST", name: "Потерян", closed: true, manual: true },
  { code: "SPAM", name: "Спам / дубль", closed: true, manual: true },
] as const;

export const LEAD_REASON_STAGES = ["DISQUALIFIED", "CLOSED_LOST", "SPAM"];

export function validateManualLeadStage(code: unknown, reason: unknown) {
  if (typeof code !== "string" || !LEAD_STAGES.some(stage => stage.code === code && stage.manual)) {
    return "Выберите ручной этап лида. Запись, КП и продажа подтверждаются рабочим процессом.";
  }
  if (LEAD_REASON_STAGES.includes(code) && (typeof reason !== "string" || !reason.trim())) {
    return "Укажите причину отказа, потери или спама.";
  }
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) {
    return "Причина должна быть текстом не длиннее 500 символов.";
  }
  return null;
}

export function leadOutcomeStage(events: Array<{ conversion_value: unknown; adjustments: Array<{ adjustment_type: string }> }>) {
  if (!events.length) return null;
  return events.some(event => Number(event.conversion_value) > 0 && !event.adjustments.some(item => item.adjustment_type === "RETRACTION"))
    ? "CLOSED_WON" : "CLOSED_LOST";
}
