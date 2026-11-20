const commonLabels: Record<string, string> = {
  queued: "В очереди", retry: "Ожидает повтора", needs_operator_action: "Требуется проверка",
};
const providerLabels: Record<"facebook" | "google", Record<string, string>> = {
  facebook: { processing: "Обрабатывается CRM", accepted: "Принято Facebook", test_accepted: "Только тест · принято Facebook" },
  google: {
    not_queued: "Событие записано, отсутствует в очереди отправки", submitting: "Идёт отправка",
    submitted: "Отправлено", submitted_without_request_id: "Отправлено, нет ID для проверки результата",
    confirmed: "Обработка подтверждена Google", validated: "Только тест · проверено Google",
  },
};
const skippedReasons: Record<string, string> = {
  unsupported_source: "Источник лида не поддерживается",
  consent_denied: "Передача рекламных данных запрещена",
  consent_not_granted: "Нет согласия на передачу рекламных данных",
  missing_matching_data: "Недостаточно данных для сопоставления",
  no_usable_identifiers: "Недостаточно данных для сопоставления",
  click_too_old: "Истёк срок учёта рекламного клика",
  invalid_event_time: "Некорректное время события",
  event_too_old: "Истёк срок отправки события в Facebook",
  lead_unavailable: "Запись лида недоступна",
  sale_unavailable: "Запись продажи недоступна",
  sale_retracted: "Продажа отозвана",
  unverified_sale_value: "Нет подтверждённой суммы продажи",
};

export function deliveryLabel(provider: "facebook" | "google", status: string, errorCode?: unknown, source?: string | null) {
  if (status === "suppressed") {
    const reason = provider === "facebook" && errorCode === "unsupported_source" && source === "facebook_messenger"
      ? "Лиды из Messenger не поддерживаются для отправки в Facebook"
      : typeof errorCode === "string" && Object.hasOwn(skippedReasons, errorCode) ? skippedReasons[errorCode] : "Причина не указана";
    return `Отправка пропущена · ${reason}`;
  }
  const labels = providerLabels[provider];
  return Object.hasOwn(labels, status) ? labels[status] : Object.hasOwn(commonLabels, status) ? commonLabels[status] : "Статус неизвестен";
}


export function deliveryEventLabel(name: string) {
  const names: Record<string, string> = { qualified_lead: "QualifiedLead", converted_lead: "ConvertedLead", RETRACTION: "Отзыв конверсии", RESTATEMENT: "Корректировка суммы" };
  return Object.hasOwn(names, name) ? names[name] : name;
}
