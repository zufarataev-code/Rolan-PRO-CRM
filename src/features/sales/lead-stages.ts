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

/**
 * Call outcome a manager marks with one tap in «Новые лиды». It answers the
 * advertising question «what kind of lead is this?» separately from the stage:
 * a lead can be reached and still not qualified.
 */
export const LEAD_CONTACT_TAGS = [
  { code: "REACHED", name: "Дозвонились", tone: "ok", nextStage: "CONTACTED" },
  { code: "NOT_REACHED", name: "Не дозвонились", tone: "warn", nextStage: "CONTACTING" },
  { code: "WRONG_PHONE", name: "Неверный телефон", tone: "danger", nextStage: null },
] as const;

export type LeadContactTagCode = (typeof LEAD_CONTACT_TAGS)[number]["code"];

/** `null` clears the tag; anything outside the list is rejected. */
export function validateLeadContactTag(tag: unknown) {
  if (tag === null) return null;
  if (typeof tag !== "string" || !LEAD_CONTACT_TAGS.some(item => item.code === tag)) {
    return "Выберите отметку дозвона: Дозвонились, Не дозвонились или Неверный телефон.";
  }
  return null;
}

/** Stages the tag may move a lead out of: only the first-contact ones, never a workflow or closed stage. */
const CONTACT_TAG_FROM_STAGES = ["NEW_LEAD", "LEAD", "CONTACTING", "CONTACTED"];

/**
 * «Дозвонились» means the contact is established, «Не дозвонились» means we are
 * still trying. Returns the stage to move to, or null when the stage stays.
 */
export function contactTagStage(tag: LeadContactTagCode | null, currentStage: string) {
  const item = LEAD_CONTACT_TAGS.find(entry => entry.code === tag);
  if (!item?.nextStage || item.nextStage === currentStage || !CONTACT_TAG_FROM_STAGES.includes(currentStage)) return null;
  // «Не дозвонились» never demotes an established contact.
  if (item.nextStage === "CONTACTING" && currentStage === "CONTACTED") return null;
  return item.nextStage;
}

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
  const active = events.filter(event => !event.adjustments.some(item => item.adjustment_type === "RETRACTION"));
  if (active.some(event => Number(event.conversion_value) > 0)) return "CLOSED_WON";
  if (!active.length) return "CLOSED_LOST";
  return null;
}
