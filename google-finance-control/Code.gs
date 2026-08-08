/**
 * Finance Control PRO for Google Sheets.
 *
 * What it builds:
 * - family/business cashflow accounting
 * - accounts, credit cards, loans, subscriptions, budgets, orders/projects
 * - payment calendar with Google Calendar sync
 * - Telegram reminders and optional Telegram command input
 * - business expense control: order/accounting reference is required
 */

const FINANCE = {
  version: '1.0.0',
  timezone: 'America/Los_Angeles',
  locale: 'en_US',
  defaultCurrency: 'USD',
  horizonDays: 120,
  sheets: {
    dashboard: 'Дашборд',
    operations: 'Операции',
    calendar: 'ПлатежныйКалендарь',
    subscriptions: 'Подписки',
    accounts: 'Счета',
    cards: 'КредитныеКарты',
    loans: 'Кредиты',
    orders: 'Заказы',
    budget: 'Бюджет',
    analytics: 'Аналитика',
    refs: 'Справочники',
    accounting: 'Бухгалтерия_Экспорт',
    log: 'Журнал'
  },
  headers: {
    operations: [
      'ID', 'Дата', 'Месяц', 'Контур', 'Тип', 'Сумма', 'Валюта',
      'Откуда', 'Куда', 'Категория', 'Подкатегория', 'Теги', 'Контрагент',
      'Заказ', 'Подписка', 'Кредит/карта', 'Метод', 'Документ', 'Учет',
      'Синхронизация', 'Статус', 'Комментарий', 'Создано', 'Обновлено', 'Пользователь'
    ],
    calendar: [
      'ID', 'Дата', 'Тип', 'Название', 'Контур', 'Сумма', 'Валюта',
      'Списать с', 'Источник ID', 'Статус', 'Операция ID', 'Календарь ID',
      'Напомнить за дней', 'Комментарий'
    ],
    subscriptions: [
      'ID', 'Название', 'Контур', 'Категория', 'Сумма', 'Валюта',
      'Списать с', 'Частота', 'Следующая дата', 'Дата окончания',
      'Автооперация', 'Напомнить за дней', 'Календарь ID', 'Статус',
      'Теги', 'Комментарий'
    ],
    accounts: [
      'ID', 'Название', 'Тип счета', 'Контур', 'Валюта', 'Стартовый баланс',
      'Текущий баланс', 'Кредитный лимит', 'Банк', 'День выписки',
      'День платежа', 'Активен', 'Комментарий'
    ],
    cards: [
      'ID', 'Название', 'Банк', 'Счет оплаты', 'Лимит', 'Текущий долг',
      'Мин. платеж', 'Валюта', 'День выписки', 'День платежа', 'APR',
      'Напомнить за дней', 'Календарь ID', 'Статус', 'Комментарий'
    ],
    loans: [
      'ID', 'Название', 'Контур', 'Кредитор', 'Тип кредита', 'Первоначальная сумма',
      'Текущий остаток', 'Ежемесячный платеж', 'Валюта', 'Списать с',
      'День платежа', 'Следующая дата', 'APR', 'Напомнить за дней',
      'Календарь ID', 'Статус', 'Комментарий'
    ],
    orders: [
      'ID', 'Название/клиент', 'Контур', 'Статус', 'Дата старта', 'Сумма договора',
      'Поступления', 'Расходы', 'Прибыль', 'Маржа', 'Ответственный', 'Комментарий'
    ],
    budget: [
      'Месяц', 'Контур', 'Категория', 'Лимит', 'Факт', 'Остаток',
      'Использовано %', 'Комментарий'
    ],
    accounting: [
      'ID операции', 'Дата', 'Контур', 'Тип', 'Сумма', 'Валюта', 'Категория',
      'Контрагент', 'Заказ', 'Документ', 'Учет', 'Комментарий', 'Статус синхронизации'
    ],
    log: ['Время', 'Уровень', 'Событие', 'Детали']
  },
  namedRanges: {
    scopes: 'FinanceScopes',
    operationTypes: 'FinanceOperationTypes',
    operationStatuses: 'FinanceOperationStatuses',
    syncStatuses: 'FinanceSyncStatuses',
    frequencies: 'FinanceFrequencies',
    accountTypes: 'FinanceAccountTypes',
    paymentMethods: 'FinancePaymentMethods',
    currencies: 'FinanceCurrencies',
    bools: 'FinanceYesNo',
    categories: 'FinanceCategories',
    notifyDays: 'FinanceNotifyDays',
    accounts: 'FinanceAccounts',
    orders: 'FinanceOrders',
    subscriptions: 'FinanceSubscriptions',
    cardsAndLoans: 'FinanceCardsAndLoans'
  },
  lists: {
    scopes: ['Семья', 'Бизнес'],
    operationTypes: ['Приход', 'Расход', 'Перевод', 'Платеж по кредиту', 'Погашение карты', 'Возврат'],
    operationStatuses: ['Факт', 'План', 'Отменено'],
    syncStatuses: ['Новый', 'К бухгалтеру', 'Синхронизирован', 'Не нужен'],
    frequencies: ['Разово', 'Еженедельно', 'Ежемесячно', 'Ежеквартально', 'Ежегодно'],
    accountTypes: ['Наличные', 'Расчетный счет', 'Сберегательный счет', 'Кредитная карта', 'Кредит/заем', 'Инвестиции'],
    paymentMethods: ['Карта', 'Банк', 'Наличные', 'ACH', 'Wire', 'Zelle', 'Check', 'Другое'],
    currencies: ['USD', 'EUR', 'RUB'],
    bools: ['Да', 'Нет'],
    notifyDays: [0, 1, 2, 3, 5, 7, 14, 30],
    familyCategories: [
      'Продукты', 'Дом', 'Коммунальные', 'Транспорт', 'Авто', 'Здоровье',
      'Страховки', 'Дети', 'Образование', 'Одежда', 'Развлечения',
      'Путешествия', 'Подписки', 'Кредиты', 'Налоги', 'Другое'
    ],
    businessCategories: [
      'Материалы', 'Инструменты', 'Субподрядчики', 'Зарплаты', 'Реклама',
      'CRM/софт', 'Офис', 'Транспорт бизнес', 'Доставка', 'Комиссии',
      'Налоги бизнес', 'Страховки бизнес', 'Поступления от клиентов',
      'Возвраты клиентам', 'Подписки бизнес', 'Другое бизнес'
    ],
    tags: [
      'важно', 'налоги', 'чек нужен', 'возместить', 'личное', 'бизнес',
      'заказ', 'подписка', 'кредит', 'карта'
    ]
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Finance Control PRO')
    .addItem('1. Создать/обновить систему', 'setupFinanceSystem')
    .addSeparator()
    .addItem('Быстрый ввод операции', 'showEntrySidebar')
    .addItem('Обновить платежный календарь', 'rebuildPaymentCalendar')
    .addItem('Синхронизировать Google Calendar', 'syncPaymentSourcesToCalendar')
    .addItem('Обновить экспорт бухгалтерии', 'prepareAccountingExport')
    .addSeparator()
    .addItem('Отправить тест в Telegram', 'sendTelegramTest')
    .addItem('Настроить Telegram', 'configureTelegram')
    .addItem('Настроить календарь', 'configureFinanceCalendar')
    .addItem('Установить ежедневную автоматику', 'installFinanceTriggers')
    .addToUi();
}

function setupFinanceSystem() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(FINANCE.timezone);
  ss.setSpreadsheetLocale(FINANCE.locale);

  ensureCoreSheets_();
  setupReferences_();
  setupAccounts_();
  setupCards_();
  setupSubscriptions_();
  setupLoans_();
  setupOrders_();
  setupOperations_();
  setupPaymentCalendar_();
  setupBudget_();
  setupDashboard_();
  setupAnalytics_();
  setupAccountingExport_();
  setupLog_();
  configureDataValidations_();
  rebuildPaymentCalendar();
  log_('INFO', 'setupFinanceSystem', 'Finance Control PRO ' + FINANCE.version + ' готов.');
  SpreadsheetApp.flush();
}

function showEntrySidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Быстрый ввод')
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

function installFinanceTriggers() {
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runDailyFinanceAutomation') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('runDailyFinanceAutomation')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  SpreadsheetApp.getUi().alert('Готово: ежедневная проверка платежей будет запускаться примерно в 08:00.');
}

function runDailyFinanceAutomation() {
  autoCreateDueSubscriptions_();
  rebuildPaymentCalendar();
  syncPaymentSourcesToCalendar();
  sendDailyDigest_();
  log_('INFO', 'runDailyFinanceAutomation', 'Ежедневная автоматика выполнена.');
}

function configureTelegram() {
  const ui = SpreadsheetApp.getUi();
  const token = ui.prompt('Telegram Bot Token', 'Вставьте токен от BotFather:', ui.ButtonSet.OK_CANCEL);
  if (token.getSelectedButton() !== ui.Button.OK) return;
  const chatId = ui.prompt('Telegram Chat ID', 'Вставьте chat_id, куда отправлять уведомления:', ui.ButtonSet.OK_CANCEL);
  if (chatId.getSelectedButton() !== ui.Button.OK) return;

  PropertiesService.getScriptProperties().setProperties({
    TELEGRAM_BOT_TOKEN: token.getResponseText().trim(),
    TELEGRAM_CHAT_ID: chatId.getResponseText().trim()
  }, true);

  sendTelegram_('Finance Control PRO: Telegram уведомления подключены.');
  ui.alert('Telegram подключен. Я отправил тестовое сообщение.');
}

function configureFinanceCalendar() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Google Calendar',
    'Вставьте Calendar ID. Если оставить пустым, будет использоваться основной календарь.',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;

  PropertiesService.getScriptProperties().setProperty('FINANCE_CALENDAR_ID', result.getResponseText().trim());
  ui.alert('Календарь сохранен.');
}

function sendTelegramTest() {
  const text = getFinanceSummaryText_();
  sendTelegram_(text || 'Finance Control PRO: тестовое сообщение.');
}

function setTelegramWebhook(webAppUrl) {
  const token = getTelegramToken_();
  if (!token) throw new Error('Сначала настройте TELEGRAM_BOT_TOKEN через меню.');
  const url = 'https://api.telegram.org/bot' + encodeURIComponent(token) + '/setWebhook';
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ url: webAppUrl }),
    muteHttpExceptions: true
  });
  log_('INFO', 'setTelegramWebhook', response.getContentText());
  return response.getContentText();
}

function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents || '{}');
    handleTelegramUpdate_(update);
    return ContentService.createTextOutput('ok');
  } catch (error) {
    log_('ERROR', 'doPost', String(error && error.stack ? error.stack : error));
    return ContentService.createTextOutput('error');
  }
}

function onEdit(e) {
  try {
    handleFinanceEdit_(e);
  } catch (error) {
    log_('ERROR', 'onEdit', String(error && error.stack ? error.stack : error));
  }
}

function handleFinanceEdit_(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  if (row < 2) return;

  if (sheet.getName() === FINANCE.sheets.operations) {
    normalizeOperationRow_(sheet, row);
    return;
  }

  if (sheet.getName() === FINANCE.sheets.calendar) {
    const headers = getHeaders_(sheet);
    const statusCol = col_(headers, 'Статус');
    if (e.range.getColumn() === statusCol && String(e.value || '').trim() === 'Оплачено') {
      createOperationFromCalendarPayment_(sheet, row);
    }
  }
}

function getFinanceMeta() {
  return {
    scopes: FINANCE.lists.scopes,
    operationTypes: FINANCE.lists.operationTypes,
    currencies: FINANCE.lists.currencies,
    accounts: readIdNameList_(FINANCE.sheets.accounts, 'ID', 'Название', 'Активен'),
    categoriesFamily: FINANCE.lists.familyCategories,
    categoriesBusiness: FINANCE.lists.businessCategories,
    orders: readIdNameList_(FINANCE.sheets.orders, 'ID', 'Название/клиент', 'Статус'),
    subscriptions: readIdNameList_(FINANCE.sheets.subscriptions, 'ID', 'Название', 'Статус'),
    cardsAndLoans: getCardsAndLoansList_(),
    paymentMethods: FINANCE.lists.paymentMethods,
    tags: FINANCE.lists.tags
  };
}

function addTransactionFromSidebar(payload) {
  const op = {
    date: payload.date ? new Date(payload.date + 'T00:00:00') : new Date(),
    scope: payload.scope || 'Семья',
    type: payload.type || 'Расход',
    amount: parseMoney_(payload.amount),
    currency: payload.currency || FINANCE.defaultCurrency,
    from: payload.from || '',
    to: payload.to || '',
    category: payload.category || '',
    subcategory: payload.subcategory || '',
    tags: payload.tags || '',
    counterparty: payload.counterparty || '',
    order: payload.order || '',
    subscription: payload.subscription || '',
    cardOrLoan: payload.cardOrLoan || '',
    method: payload.method || '',
    document: payload.document || '',
    accountingRef: payload.accountingRef || '',
    syncStatus: payload.syncStatus || 'Новый',
    status: payload.status || 'Факт',
    note: payload.note || '',
    user: Session.getActiveUser().getEmail() || ''
  };

  validateOperationShape_(op);
  validateBusinessExpense_(op);
  const id = appendOperation_(op);
  return { ok: true, message: 'Операция сохранена: ' + id, id: id };
}

function rebuildPaymentCalendar() {
  const sheet = getSheet_(FINANCE.sheets.calendar);
  const headers = FINANCE.headers.calendar;
  writeHeader_(sheet, headers);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent().clearNote();
  }

  const today = today_();
  const fromDate = addDays_(today, -30);
  const untilDate = addDays_(today, FINANCE.horizonDays);
  let rows = [];

  rows = rows.concat(buildSubscriptionCalendarRows_(fromDate, untilDate));
  rows = rows.concat(buildLoanCalendarRows_(fromDate, untilDate));
  rows = rows.concat(buildCardCalendarRows_(fromDate, untilDate));

  rows.sort(function(a, b) {
    return toDateOnly_(a[1]).getTime() - toDateOnly_(b[1]).getTime();
  });

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  applyCalendarFormatting_(sheet);
  log_('INFO', 'rebuildPaymentCalendar', 'Строк: ' + rows.length);
}

function syncPaymentSourcesToCalendar() {
  const calendar = getFinanceCalendar_();
  syncSubscriptionsToCalendar_(calendar);
  syncLoansToCalendar_(calendar);
  syncCardsToCalendar_(calendar);
  log_('INFO', 'syncPaymentSourcesToCalendar', 'Синхронизация завершена.');
}

function prepareAccountingExport() {
  const ops = getRowsAsObjects_(FINANCE.sheets.operations);
  const rows = [];
  ops.forEach(function(item) {
    const op = item.object;
    if (!op.ID) return;
    if (op.Контур !== 'Бизнес') return;
    if (op.Синхронизация === 'Синхронизирован' || op.Синхронизация === 'Не нужен') return;
    rows.push([
      op.ID, op.Дата, op.Контур, op.Тип, op.Сумма, op.Валюта, op.Категория,
      op.Контрагент, op.Заказ, op.Документ, op.Учет, op.Комментарий, op.Синхронизация || 'Новый'
    ]);
  });

  const sheet = getSheet_(FINANCE.sheets.accounting);
  writeHeader_(sheet, FINANCE.headers.accounting);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, FINANCE.headers.accounting.length).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, FINANCE.headers.accounting.length).setValues(rows);
  }
  formatSheet_(sheet, FINANCE.headers.accounting.length);
  SpreadsheetApp.getUi().alert('Экспорт бухгалтерии обновлен. Строк: ' + rows.length);
}

function ensureCoreSheets_() {
  Object.keys(FINANCE.sheets).forEach(function(key) {
    ensureSheet_(FINANCE.sheets[key]);
  });
}

function setupReferences_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = getSheet_(FINANCE.sheets.refs);
  sheet.clear();

  const allCategories = FINANCE.lists.familyCategories.concat(FINANCE.lists.businessCategories);
  const columns = [
    ['Контуры'].concat(FINANCE.lists.scopes),
    ['Типы операций'].concat(FINANCE.lists.operationTypes),
    ['Статусы операций'].concat(FINANCE.lists.operationStatuses),
    ['Статусы синхронизации'].concat(FINANCE.lists.syncStatuses),
    ['Частоты'].concat(FINANCE.lists.frequencies),
    ['Типы счетов'].concat(FINANCE.lists.accountTypes),
    ['Методы оплаты'].concat(FINANCE.lists.paymentMethods),
    ['Валюты'].concat(FINANCE.lists.currencies),
    ['Да/Нет'].concat(FINANCE.lists.bools),
    ['Напомнить за дней'].concat(FINANCE.lists.notifyDays),
    ['Категории семья'].concat(FINANCE.lists.familyCategories),
    ['Категории бизнес'].concat(FINANCE.lists.businessCategories),
    ['Все категории'].concat(allCategories),
    ['Теги'].concat(FINANCE.lists.tags)
  ];

  const maxLen = columns.reduce(function(max, colValues) {
    return Math.max(max, colValues.length);
  }, 0);

  const values = [];
  for (let r = 0; r < maxLen; r++) {
    values.push(columns.map(function(colValues) {
      return colValues[r] === undefined ? '' : colValues[r];
    }));
  }

  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, values[0].length).setFontWeight('bold').setBackground('#203864').setFontColor('#ffffff');
  sheet.autoResizeColumns(1, values[0].length);

  removeFinanceNamedRanges_(ss);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.scopes, 1, FINANCE.lists.scopes.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.operationTypes, 2, FINANCE.lists.operationTypes.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.operationStatuses, 3, FINANCE.lists.operationStatuses.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.syncStatuses, 4, FINANCE.lists.syncStatuses.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.frequencies, 5, FINANCE.lists.frequencies.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.accountTypes, 6, FINANCE.lists.accountTypes.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.paymentMethods, 7, FINANCE.lists.paymentMethods.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.currencies, 8, FINANCE.lists.currencies.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.bools, 9, FINANCE.lists.bools.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.notifyDays, 10, FINANCE.lists.notifyDays.length);
  setNamedRangeFromList_(ss, sheet, FINANCE.namedRanges.categories, 13, allCategories.length);
}

function setupAccounts_() {
  const sheet = getSheet_(FINANCE.sheets.accounts);
  writeHeader_(sheet, FINANCE.headers.accounts);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 4, FINANCE.headers.accounts.length).setValues([
      ['CASH', 'Наличные', 'Наличные', 'Семья', FINANCE.defaultCurrency, 0, '', '', '', '', '', 'Да', ''],
      ['PERSONAL_CHECKING', 'Личный checking', 'Расчетный счет', 'Семья', FINANCE.defaultCurrency, 0, '', '', '', '', '', 'Да', ''],
      ['BUSINESS_CHECKING', 'Бизнес checking', 'Расчетный счет', 'Бизнес', FINANCE.defaultCurrency, 0, '', '', '', '', '', 'Да', ''],
      ['CC_MAIN', 'Основная кредитная карта', 'Кредитная карта', 'Семья', FINANCE.defaultCurrency, 0, '', 0, '', 1, 20, 'Да', 'Добавьте кредитный лимит и банк']
    ]);
  }
  applyAccountFormulas_();
  formatSheet_(sheet, FINANCE.headers.accounts.length);
}

function setupCards_() {
  const sheet = getSheet_(FINANCE.sheets.cards);
  writeHeader_(sheet, FINANCE.headers.cards);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, FINANCE.headers.cards.length).setValues([
      ['CC_MAIN', 'Основная кредитная карта', '', 'PERSONAL_CHECKING', 0, '', 0, FINANCE.defaultCurrency, 1, 20, '', 7, '', 'Активна', '']
    ]);
  }
  applyCardFormulas_();
  formatSheet_(sheet, FINANCE.headers.cards.length);
}

function setupSubscriptions_() {
  const sheet = getSheet_(FINANCE.sheets.subscriptions);
  writeHeader_(sheet, FINANCE.headers.subscriptions);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 3, FINANCE.headers.subscriptions.length).setValues([
      ['SUB_CRM', 'CRM/софт', 'Бизнес', 'CRM/софт', 0, FINANCE.defaultCurrency, 'BUSINESS_CHECKING', 'Ежемесячно', '', '', 'Нет', 7, '', 'Активна', 'софт,налоги', ''],
      ['SUB_PHONE', 'Телефон/связь', 'Семья', 'Коммунальные', 0, FINANCE.defaultCurrency, 'PERSONAL_CHECKING', 'Ежемесячно', '', '', 'Нет', 7, '', 'Активна', '', ''],
      ['SUB_STREAM', 'Стриминг', 'Семья', 'Подписки', 0, FINANCE.defaultCurrency, 'CC_MAIN', 'Ежемесячно', '', '', 'Нет', 7, '', 'Активна', '', '']
    ]);
  }
  formatSheet_(sheet, FINANCE.headers.subscriptions.length);
}

function setupLoans_() {
  const sheet = getSheet_(FINANCE.sheets.loans);
  writeHeader_(sheet, FINANCE.headers.loans);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, FINANCE.headers.loans.length).setValues([
      ['LOAN_AUTO', 'Автокредит / другой кредит', 'Семья', '', 'Авто/личный', 0, 0, 0, FINANCE.defaultCurrency, 'PERSONAL_CHECKING', 1, '', '', 7, '', 'Активен', '']
    ]);
  }
  formatSheet_(sheet, FINANCE.headers.loans.length);
}

function setupOrders_() {
  const sheet = getSheet_(FINANCE.sheets.orders);
  writeHeader_(sheet, FINANCE.headers.orders);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, FINANCE.headers.orders.length).setValues([
      ['ORDER-001', 'Пример заказа / клиент', 'Бизнес', 'Активен', new Date(), 0, '', '', '', '', '', 'Для бизнес-расходов выбирайте заказ здесь']
    ]);
  }
  applyOrderFormulas_();
  formatSheet_(sheet, FINANCE.headers.orders.length);
}

function setupOperations_() {
  const sheet = getSheet_(FINANCE.sheets.operations);
  writeHeader_(sheet, FINANCE.headers.operations);
  formatSheet_(sheet, FINANCE.headers.operations.length);
  sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('F:F').setNumberFormat('$#,##0.00;-$#,##0.00');
  sheet.getRange('W:X').setNumberFormat('yyyy-mm-dd hh:mm');
}

function setupPaymentCalendar_() {
  const sheet = getSheet_(FINANCE.sheets.calendar);
  writeHeader_(sheet, FINANCE.headers.calendar);
  applyCalendarFormatting_(sheet);
}

function setupBudget_() {
  const sheet = getSheet_(FINANCE.sheets.budget);
  writeHeader_(sheet, FINANCE.headers.budget);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 6, FINANCE.headers.budget.length).setValues([
      [formatMonth_(new Date()), 'Семья', 'Продукты', 0, '', '', '', ''],
      [formatMonth_(new Date()), 'Семья', 'Дом', 0, '', '', '', ''],
      [formatMonth_(new Date()), 'Бизнес', 'Материалы', 0, '', '', '', ''],
      [formatMonth_(new Date()), 'Бизнес', 'Реклама', 0, '', '', '', ''],
      [formatMonth_(new Date()), 'Бизнес', 'CRM/софт', 0, '', '', '', ''],
      [formatMonth_(new Date()), 'Семья', 'Подписки', 0, '', '', '', '']
    ]);
  }
  applyBudgetFormulas_();
  formatSheet_(sheet, FINANCE.headers.budget.length);
}

function setupDashboard_() {
  const sheet = getSheet_(FINANCE.sheets.dashboard);
  sheet.clear();
  sheet.getRange('A1:H30').breakApart();
  sheet.getRange('A1:H1').merge().setValue('Finance Control PRO')
    .setFontSize(20).setFontWeight('bold').setFontColor('#ffffff').setBackground('#203864');
  sheet.getRange('A2:H2').merge().setValue('Деньги, подписки, кредиты, карты, заказы и бизнес-контроль в одной таблице.')
    .setFontColor('#555555');

  sheet.getRange('A4').setValue('Текущий месяц');
  sheet.getRange('B4').setFormula('=TEXT(TODAY(),"yyyy-mm")');

  sheet.getRange('A6:D6').setValues([['Контур', 'Приход', 'Расход', 'Итог']])
    .setFontWeight('bold').setBackground('#d9eaf7');
  sheet.getRange('A7:A8').setValues([['Семья'], ['Бизнес']]);
  sheet.getRange('B7').setFormula('=SUMIFS(Операции!$F:$F,Операции!$C:$C,$B$4,Операции!$D:$D,$A7,Операции!$E:$E,"Приход",Операции!$U:$U,"<>Отменено")');
  sheet.getRange('C7').setFormula('=SUMIFS(Операции!$F:$F,Операции!$C:$C,$B$4,Операции!$D:$D,$A7,Операции!$E:$E,"Расход",Операции!$U:$U,"<>Отменено")');
  sheet.getRange('D7').setFormula('=B7-C7');
  sheet.getRange('B8:D8').setFormulas([[
    '=SUMIFS(Операции!$F:$F,Операции!$C:$C,$B$4,Операции!$D:$D,$A8,Операции!$E:$E,"Приход",Операции!$U:$U,"<>Отменено")',
    '=SUMIFS(Операции!$F:$F,Операции!$C:$C,$B$4,Операции!$D:$D,$A8,Операции!$E:$E,"Расход",Операции!$U:$U,"<>Отменено")',
    '=B8-C8'
  ]]);

  sheet.getRange('F6:H6').setValues([['Контроль', 'Кол-во', 'Сумма']])
    .setFontWeight('bold').setBackground('#d9eaf7');
  sheet.getRange('F7:F10').setValues([
    ['Платежи 7 дней'],
    ['Просрочено'],
    ['Бизнес без заказа/учета'],
    ['К бухгалтеру']
  ]);
  sheet.getRange('G7').setFormula('=COUNTIFS(ПлатежныйКалендарь!$B:$B,">="&TODAY(),ПлатежныйКалендарь!$B:$B,"<="&TODAY()+7,ПлатежныйКалендарь!$J:$J,"<>Оплачено")');
  sheet.getRange('H7').setFormula('=SUMIFS(ПлатежныйКалендарь!$F:$F,ПлатежныйКалендарь!$B:$B,">="&TODAY(),ПлатежныйКалендарь!$B:$B,"<="&TODAY()+7,ПлатежныйКалендарь!$J:$J,"<>Оплачено")');
  sheet.getRange('G8').setFormula('=COUNTIFS(ПлатежныйКалендарь!$B:$B,"<"&TODAY(),ПлатежныйКалендарь!$J:$J,"<>Оплачено")');
  sheet.getRange('H8').setFormula('=SUMIFS(ПлатежныйКалендарь!$F:$F,ПлатежныйКалендарь!$B:$B,"<"&TODAY(),ПлатежныйКалендарь!$J:$J,"<>Оплачено")');
  sheet.getRange('G9').setFormula('=COUNTIFS(Операции!$D:$D,"Бизнес",Операции!$E:$E,"Расход",Операции!$N:$N,"",Операции!$S:$S,"",Операции!$U:$U,"<>Отменено")');
  sheet.getRange('H9').setFormula('=SUMIFS(Операции!$F:$F,Операции!$D:$D,"Бизнес",Операции!$E:$E,"Расход",Операции!$N:$N,"",Операции!$S:$S,"",Операции!$U:$U,"<>Отменено")');
  sheet.getRange('G10').setFormula('=COUNTIFS(Операции!$D:$D,"Бизнес",Операции!$T:$T,"К бухгалтеру")');
  sheet.getRange('H10').setFormula('=SUMIFS(Операции!$F:$F,Операции!$D:$D,"Бизнес",Операции!$T:$T,"К бухгалтеру")');

  sheet.getRange('A12:H12').merge().setValue('Ближайшие платежи')
    .setFontWeight('bold').setBackground('#e2f0d9');
  sheet.getRange('A13').setFormula('=IFERROR(SORT(FILTER(ПлатежныйКалендарь!B:N,ПлатежныйКалендарь!B:B<=TODAY()+14,ПлатежныйКалендарь!J:J<>"Оплачено"),1,TRUE),"Нет платежей на 14 дней")');

  sheet.getRange('A4:H30').setVerticalAlignment('middle');
  sheet.getRange('B7:D8').setNumberFormat('$#,##0.00;-$#,##0.00');
  sheet.getRange('H7:H10').setNumberFormat('$#,##0.00;-$#,##0.00');
  sheet.setFrozenRows(2);
  sheet.setColumnWidths(1, 8, 130);
  sheet.getRange('A1:H30').setFontFamily('Arial');
}

function setupAnalytics_() {
  const sheet = getSheet_(FINANCE.sheets.analytics);
  sheet.clear();
  sheet.getRange('A1').setValue('Свод по месяцам, контуру, типу и категории').setFontWeight('bold');
  sheet.getRange('A3').setFormula('=QUERY(Операции!A:Y,"select C,D,E,J,sum(F) where A is not null and U <> \'Отменено\' group by C,D,E,J label sum(F) \'Сумма\'",1)');
  sheet.getRange('H1').setValue('Бизнес-расходы по заказам').setFontWeight('bold');
  sheet.getRange('H3').setFormula('=QUERY(Операции!A:Y,"select N,J,sum(F) where D = \'Бизнес\' and E = \'Расход\' and U <> \'Отменено\' group by N,J label sum(F) \'Расход\'",1)');
  sheet.getRange('M1').setValue('Топ категорий расходов').setFontWeight('bold');
  sheet.getRange('M3').setFormula('=QUERY(Операции!A:Y,"select D,J,sum(F) where E = \'Расход\' and U <> \'Отменено\' group by D,J order by sum(F) desc label sum(F) \'Расход\'",1)');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 18, 130);
}

function setupAccountingExport_() {
  const sheet = getSheet_(FINANCE.sheets.accounting);
  writeHeader_(sheet, FINANCE.headers.accounting);
  formatSheet_(sheet, FINANCE.headers.accounting.length);
}

function setupLog_() {
  const sheet = getSheet_(FINANCE.sheets.log);
  writeHeader_(sheet, FINANCE.headers.log);
  formatSheet_(sheet, FINANCE.headers.log.length);
}

function configureDataValidations_() {
  const ss = SpreadsheetApp.getActive();
  setDynamicNamedRanges_(ss);

  applyNamedValidation_(FINANCE.sheets.operations, 'Контур', FINANCE.namedRanges.scopes);
  applyNamedValidation_(FINANCE.sheets.operations, 'Тип', FINANCE.namedRanges.operationTypes);
  applyNamedValidation_(FINANCE.sheets.operations, 'Валюта', FINANCE.namedRanges.currencies);
  applyNamedValidation_(FINANCE.sheets.operations, 'Откуда', FINANCE.namedRanges.accounts);
  applyNamedValidation_(FINANCE.sheets.operations, 'Куда', FINANCE.namedRanges.accounts);
  applyNamedValidation_(FINANCE.sheets.operations, 'Категория', FINANCE.namedRanges.categories);
  applyNamedValidation_(FINANCE.sheets.operations, 'Заказ', FINANCE.namedRanges.orders);
  applyNamedValidation_(FINANCE.sheets.operations, 'Подписка', FINANCE.namedRanges.subscriptions);
  applyNamedValidation_(FINANCE.sheets.operations, 'Кредит/карта', FINANCE.namedRanges.cardsAndLoans);
  applyNamedValidation_(FINANCE.sheets.operations, 'Метод', FINANCE.namedRanges.paymentMethods);
  applyNamedValidation_(FINANCE.sheets.operations, 'Синхронизация', FINANCE.namedRanges.syncStatuses);
  applyNamedValidation_(FINANCE.sheets.operations, 'Статус', FINANCE.namedRanges.operationStatuses);

  applyNamedValidation_(FINANCE.sheets.subscriptions, 'Контур', FINANCE.namedRanges.scopes);
  applyNamedValidation_(FINANCE.sheets.subscriptions, 'Категория', FINANCE.namedRanges.categories);
  applyNamedValidation_(FINANCE.sheets.subscriptions, 'Валюта', FINANCE.namedRanges.currencies);
  applyNamedValidation_(FINANCE.sheets.subscriptions, 'Списать с', FINANCE.namedRanges.accounts);
  applyNamedValidation_(FINANCE.sheets.subscriptions, 'Частота', FINANCE.namedRanges.frequencies);
  applyNamedValidation_(FINANCE.sheets.subscriptions, 'Автооперация', FINANCE.namedRanges.bools);
  applyNamedValidation_(FINANCE.sheets.subscriptions, 'Напомнить за дней', FINANCE.namedRanges.notifyDays);

  applyNamedValidation_(FINANCE.sheets.accounts, 'Тип счета', FINANCE.namedRanges.accountTypes);
  applyNamedValidation_(FINANCE.sheets.accounts, 'Контур', FINANCE.namedRanges.scopes);
  applyNamedValidation_(FINANCE.sheets.accounts, 'Валюта', FINANCE.namedRanges.currencies);
  applyNamedValidation_(FINANCE.sheets.accounts, 'Активен', FINANCE.namedRanges.bools);

  applyNamedValidation_(FINANCE.sheets.cards, 'Счет оплаты', FINANCE.namedRanges.accounts);
  applyNamedValidation_(FINANCE.sheets.cards, 'Валюта', FINANCE.namedRanges.currencies);
  applyNamedValidation_(FINANCE.sheets.cards, 'Напомнить за дней', FINANCE.namedRanges.notifyDays);

  applyNamedValidation_(FINANCE.sheets.loans, 'Контур', FINANCE.namedRanges.scopes);
  applyNamedValidation_(FINANCE.sheets.loans, 'Валюта', FINANCE.namedRanges.currencies);
  applyNamedValidation_(FINANCE.sheets.loans, 'Списать с', FINANCE.namedRanges.accounts);
  applyNamedValidation_(FINANCE.sheets.loans, 'Напомнить за дней', FINANCE.namedRanges.notifyDays);

  applyNamedValidation_(FINANCE.sheets.orders, 'Контур', FINANCE.namedRanges.scopes);
  applyNamedValidation_(FINANCE.sheets.budget, 'Контур', FINANCE.namedRanges.scopes);
  applyNamedValidation_(FINANCE.sheets.budget, 'Категория', FINANCE.namedRanges.categories);
}

function applyAccountFormulas_() {
  const sheet = getSheet_(FINANCE.sheets.accounts);
  const headers = getHeaders_(sheet);
  const balanceCol = col_(headers, 'Текущий баланс');
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const formulas = [];
  for (let i = 2; i <= rows + 1; i++) {
    formulas.push([
      '=IF(A' + i + '="","",F' + i + '+SUMIFS(Операции!$F:$F,Операции!$I:$I,A' + i + ',Операции!$U:$U,"<>Отменено")-SUMIFS(Операции!$F:$F,Операции!$H:$H,A' + i + ',Операции!$U:$U,"<>Отменено"))'
    ]);
  }
  sheet.getRange(2, balanceCol, formulas.length, 1).setFormulas(formulas);
}

function applyCardFormulas_() {
  const sheet = getSheet_(FINANCE.sheets.cards);
  const headers = getHeaders_(sheet);
  const debtCol = col_(headers, 'Текущий долг');
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const formulas = [];
  for (let i = 2; i <= rows + 1; i++) {
    formulas.push([
      '=IF(A' + i + '="","",MAX(0,-IFERROR(VLOOKUP(A' + i + ',Счета!$A:$G,7,FALSE),0)))'
    ]);
  }
  sheet.getRange(2, debtCol, formulas.length, 1).setFormulas(formulas);
}

function applyOrderFormulas_() {
  const sheet = getSheet_(FINANCE.sheets.orders);
  const headers = getHeaders_(sheet);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const formulasIncome = [];
  const formulasCosts = [];
  const formulasProfit = [];
  const formulasMargin = [];
  for (let i = 2; i <= rows + 1; i++) {
    formulasIncome.push(['=IF(A' + i + '="","",SUMIFS(Операции!$F:$F,Операции!$N:$N,A' + i + ',Операции!$E:$E,"Приход",Операции!$U:$U,"<>Отменено"))']);
    formulasCosts.push(['=IF(A' + i + '="","",SUMIFS(Операции!$F:$F,Операции!$N:$N,A' + i + ',Операции!$E:$E,"Расход",Операции!$U:$U,"<>Отменено"))']);
    formulasProfit.push(['=IF(A' + i + '="","",G' + i + '-H' + i + ')']);
    formulasMargin.push(['=IFERROR(I' + i + '/G' + i + ',"")']);
  }
  sheet.getRange(2, col_(headers, 'Поступления'), formulasIncome.length, 1).setFormulas(formulasIncome);
  sheet.getRange(2, col_(headers, 'Расходы'), formulasCosts.length, 1).setFormulas(formulasCosts);
  sheet.getRange(2, col_(headers, 'Прибыль'), formulasProfit.length, 1).setFormulas(formulasProfit);
  sheet.getRange(2, col_(headers, 'Маржа'), formulasMargin.length, 1).setFormulas(formulasMargin);
}

function applyBudgetFormulas_() {
  const sheet = getSheet_(FINANCE.sheets.budget);
  const headers = getHeaders_(sheet);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const actual = [];
  const remaining = [];
  const used = [];
  for (let i = 2; i <= rows + 1; i++) {
    actual.push(['=IF(A' + i + '="","",SUMIFS(Операции!$F:$F,Операции!$C:$C,A' + i + ',Операции!$D:$D,B' + i + ',Операции!$J:$J,C' + i + ',Операции!$E:$E,"Расход",Операции!$U:$U,"<>Отменено"))']);
    remaining.push(['=IF(A' + i + '="","",D' + i + '-E' + i + ')']);
    used.push(['=IFERROR(E' + i + '/D' + i + ',"")']);
  }
  sheet.getRange(2, col_(headers, 'Факт'), actual.length, 1).setFormulas(actual);
  sheet.getRange(2, col_(headers, 'Остаток'), remaining.length, 1).setFormulas(remaining);
  sheet.getRange(2, col_(headers, 'Использовано %'), used.length, 1).setFormulas(used);
}

function buildSubscriptionCalendarRows_(fromDate, untilDate) {
  const data = getRowsAsObjects_(FINANCE.sheets.subscriptions);
  const rows = [];
  data.forEach(function(item) {
    const row = item.object;
    if (!isActive_(row.Статус)) return;
    let date = toDateOnly_(row['Следующая дата']);
    if (!date) return;

    const frequency = row.Частота || 'Ежемесячно';
    while (date && date <= untilDate) {
      if (date >= fromDate) {
        rows.push([
          makeCalendarId_('SUB', row.ID, date),
          date,
          'Подписка',
          row.Название,
          row.Контур,
          Number(row.Сумма || 0),
          row.Валюта || FINANCE.defaultCurrency,
          row['Списать с'],
          row.ID,
          date < today_() ? 'Просрочено' : 'План',
          '',
          row['Календарь ID'] || '',
          row['Напомнить за дней'] || 7,
          row.Комментарий || ''
        ]);
      }
      if (frequency === 'Разово') break;
      date = advanceDate_(date, frequency);
    }
  });
  return rows;
}

function buildLoanCalendarRows_(fromDate, untilDate) {
  const data = getRowsAsObjects_(FINANCE.sheets.loans);
  const rows = [];
  data.forEach(function(item) {
    const row = item.object;
    if (!isActive_(row.Статус)) return;
    let date = toDateOnly_(row['Следующая дата']);
    if (!date) date = nextDayOfMonth_(Number(row['День платежа'] || 1));
    while (date && date <= untilDate) {
      if (date >= fromDate) {
        rows.push([
          makeCalendarId_('LOAN', row.ID, date),
          date,
          'Кредит',
          row.Название,
          row.Контур,
          Number(row['Ежемесячный платеж'] || 0),
          row.Валюта || FINANCE.defaultCurrency,
          row['Списать с'],
          row.ID,
          date < today_() ? 'Просрочено' : 'План',
          '',
          row['Календарь ID'] || '',
          row['Напомнить за дней'] || 7,
          row.Комментарий || ''
        ]);
      }
      date = advanceDate_(date, 'Ежемесячно');
    }
  });
  return rows;
}

function buildCardCalendarRows_(fromDate, untilDate) {
  const data = getRowsAsObjects_(FINANCE.sheets.cards);
  const rows = [];
  data.forEach(function(item) {
    const row = item.object;
    if (!isActive_(row.Статус)) return;
    let date = nextDayOfMonth_(Number(row['День платежа'] || 1));
    while (date && date <= untilDate) {
      if (date >= fromDate) {
        const amount = Number(row['Мин. платеж'] || 0) || Number(row['Текущий долг'] || 0);
        rows.push([
          makeCalendarId_('CARD', row.ID, date),
          date,
          'Погашение карты',
          row.Название,
          'Семья',
          amount,
          row.Валюта || FINANCE.defaultCurrency,
          row['Счет оплаты'],
          row.ID,
          date < today_() ? 'Просрочено' : 'План',
          '',
          row['Календарь ID'] || '',
          row['Напомнить за дней'] || 7,
          row.Комментарий || ''
        ]);
      }
      date = advanceDate_(date, 'Ежемесячно');
    }
  });
  return rows;
}

function autoCreateDueSubscriptions_() {
  const sheet = getSheet_(FINANCE.sheets.subscriptions);
  const headers = getHeaders_(sheet);
  const data = getRowsAsObjects_(FINANCE.sheets.subscriptions);
  const today = today_();
  let created = 0;

  data.forEach(function(item) {
    const row = item.object;
    if (!isActive_(row.Статус)) return;
    if (!isYes_(row.Автооперация)) return;

    let dueDate = toDateOnly_(row['Следующая дата']);
    if (!dueDate || dueDate > today) return;

    while (dueDate && dueDate <= today) {
      if (!operationExistsForSource_(row.ID, dueDate, 'Подписка')) {
        appendOperation_({
          date: dueDate,
          scope: row.Контур,
          type: 'Расход',
          amount: row.Сумма,
          currency: row.Валюта || FINANCE.defaultCurrency,
          from: row['Списать с'],
          category: row.Категория || 'Подписки',
          tags: row.Теги || 'подписка',
          subscription: row.ID,
          accountingRef: row.Контур === 'Бизнес' ? 'subscription:' + row.ID : '',
          method: 'Авто',
          status: 'Факт',
          note: 'Автооперация по подписке: ' + row.Название
        });
        created++;
      }
      if (row.Частота === 'Разово') {
        dueDate = null;
      } else {
        dueDate = advanceDate_(dueDate, row.Частота || 'Ежемесячно');
      }
    }

    if (dueDate) {
      sheet.getRange(item.rowNumber, col_(headers, 'Следующая дата')).setValue(dueDate);
    }
  });

  if (created) {
    sendTelegram_('Finance Control PRO: создано автоопераций по подпискам: ' + created);
  }
}

function syncSubscriptionsToCalendar_(calendar) {
  const sheet = getSheet_(FINANCE.sheets.subscriptions);
  const headers = getHeaders_(sheet);
  const data = getRowsAsObjects_(FINANCE.sheets.subscriptions);
  data.forEach(function(item) {
    const row = item.object;
    if (!isActive_(row.Статус)) return;
    const date = toDateOnly_(row['Следующая дата']);
    if (!date) return;
    const title = '[Подписка] ' + row.Название + ' - ' + formatMoney_(row.Сумма, row.Валюта);
    const description = [
      'Контур: ' + (row.Контур || ''),
      'Категория: ' + (row.Категория || ''),
      'Списать с: ' + (row['Списать с'] || ''),
      'ID: ' + (row.ID || ''),
      row.Комментарий || ''
    ].join('\n');
    const eventId = createOrUpdateCalendarEvent_(calendar, row['Календарь ID'], title, date, description);
    sheet.getRange(item.rowNumber, col_(headers, 'Календарь ID')).setValue(eventId);
  });
}

function syncLoansToCalendar_(calendar) {
  const sheet = getSheet_(FINANCE.sheets.loans);
  const headers = getHeaders_(sheet);
  const data = getRowsAsObjects_(FINANCE.sheets.loans);
  data.forEach(function(item) {
    const row = item.object;
    if (!isActive_(row.Статус)) return;
    const date = toDateOnly_(row['Следующая дата']) || nextDayOfMonth_(Number(row['День платежа'] || 1));
    if (!date) return;
    const title = '[Кредит] ' + row.Название + ' - ' + formatMoney_(row['Ежемесячный платеж'], row.Валюта);
    const description = [
      'Кредитор: ' + (row.Кредитор || ''),
      'Списать с: ' + (row['Списать с'] || ''),
      'Остаток: ' + formatMoney_(row['Текущий остаток'], row.Валюта),
      'ID: ' + (row.ID || ''),
      row.Комментарий || ''
    ].join('\n');
    const eventId = createOrUpdateCalendarEvent_(calendar, row['Календарь ID'], title, date, description);
    sheet.getRange(item.rowNumber, col_(headers, 'Календарь ID')).setValue(eventId);
  });
}

function syncCardsToCalendar_(calendar) {
  const sheet = getSheet_(FINANCE.sheets.cards);
  const headers = getHeaders_(sheet);
  const data = getRowsAsObjects_(FINANCE.sheets.cards);
  data.forEach(function(item) {
    const row = item.object;
    if (!isActive_(row.Статус)) return;
    const date = nextDayOfMonth_(Number(row['День платежа'] || 1));
    const amount = Number(row['Мин. платеж'] || 0) || Number(row['Текущий долг'] || 0);
    const title = '[Карта] ' + row.Название + ' - платеж ' + formatMoney_(amount, row.Валюта);
    const description = [
      'Банк: ' + (row.Банк || ''),
      'Счет оплаты: ' + (row['Счет оплаты'] || ''),
      'Текущий долг: ' + formatMoney_(row['Текущий долг'], row.Валюта),
      'ID: ' + (row.ID || ''),
      row.Комментарий || ''
    ].join('\n');
    const eventId = createOrUpdateCalendarEvent_(calendar, row['Календарь ID'], title, date, description);
    sheet.getRange(item.rowNumber, col_(headers, 'Календарь ID')).setValue(eventId);
  });
}

function createOperationFromCalendarPayment_(sheet, rowNumber) {
  const headers = getHeaders_(sheet);
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const obj = rowToObject_(headers, row);
  if (obj['Операция ID']) return;

  let type = 'Расход';
  let to = '';
  let category = 'Подписки';
  if (obj.Тип === 'Кредит') {
    type = 'Платеж по кредиту';
    to = obj['Источник ID'];
    category = 'Кредиты';
  }
  if (obj.Тип === 'Погашение карты') {
    type = 'Погашение карты';
    to = obj['Источник ID'];
    category = 'Кредиты';
  }

  const id = appendOperation_({
    date: obj.Дата,
    scope: obj.Контур || 'Семья',
    type: type,
    amount: obj.Сумма,
    currency: obj.Валюта || FINANCE.defaultCurrency,
    from: obj['Списать с'],
    to: to,
    category: category,
    subscription: obj.Тип === 'Подписка' ? obj['Источник ID'] : '',
    cardOrLoan: obj.Тип !== 'Подписка' ? obj['Источник ID'] : '',
    accountingRef: obj.Контур === 'Бизнес' && obj.Тип === 'Подписка' ? 'subscription:' + obj['Источник ID'] : '',
    method: 'Календарь',
    status: 'Факт',
    note: 'Создано из платежного календаря: ' + obj.Название
  });
  sheet.getRange(rowNumber, col_(headers, 'Операция ID')).setValue(id);
  log_('INFO', 'createOperationFromCalendarPayment', id);
}

function normalizeOperationRow_(sheet, rowNumber) {
  const headers = getHeaders_(sheet);
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const row = range.getValues()[0];
  const obj = rowToObject_(headers, row);
  const now = new Date();
  let changed = false;

  if (!obj.ID && hasAnyValue_(row)) {
    row[col_(headers, 'ID') - 1] = makeId_('TXN');
    changed = true;
  }
  if (!obj.Дата && hasAnyValue_(row)) {
    row[col_(headers, 'Дата') - 1] = today_();
    changed = true;
  }
  if (row[col_(headers, 'Дата') - 1]) {
    row[col_(headers, 'Месяц') - 1] = formatMonth_(row[col_(headers, 'Дата') - 1]);
    changed = true;
  }
  if (!obj.Валюта && hasAnyValue_(row)) {
    row[col_(headers, 'Валюта') - 1] = FINANCE.defaultCurrency;
    changed = true;
  }
  if (!obj.Синхронизация && hasAnyValue_(row)) {
    row[col_(headers, 'Синхронизация') - 1] = 'Новый';
    changed = true;
  }
  if (!obj.Статус && hasAnyValue_(row)) {
    row[col_(headers, 'Статус') - 1] = 'Факт';
    changed = true;
  }
  if (!obj.Создано && hasAnyValue_(row)) {
    row[col_(headers, 'Создано') - 1] = now;
    changed = true;
  }
  if (hasAnyValue_(row)) {
    row[col_(headers, 'Обновлено') - 1] = now;
    changed = true;
  }
  if (!obj.Пользователь && hasAnyValue_(row)) {
    row[col_(headers, 'Пользователь') - 1] = Session.getActiveUser().getEmail() || '';
    changed = true;
  }

  if (changed) range.setValues([row]);
  markBusinessExpenseIssues_(sheet, rowNumber);
}

function markBusinessExpenseIssues_(sheet, rowNumber) {
  const headers = getHeaders_(sheet);
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const obj = rowToObject_(headers, row);
  const orderCell = sheet.getRange(rowNumber, col_(headers, 'Заказ'));
  const accountingCell = sheet.getRange(rowNumber, col_(headers, 'Учет'));

  if (obj.Контур === 'Бизнес' && obj.Тип === 'Расход' && !obj.Заказ && !obj.Учет) {
    orderCell.setBackground('#f4cccc').setNote('Для бизнес-расхода нужен номер заказа или учетная ссылка/номер счета.');
    accountingCell.setBackground('#f4cccc').setNote('Можно указать invoice, PO, job ID или пометку для бухгалтера.');
  } else {
    orderCell.setBackground(null).setNote('');
    accountingCell.setBackground(null).setNote('');
  }
}

function appendOperation_(op) {
  validateOperationShape_(op);
  validateBusinessExpense_(op);
  const sheet = getSheet_(FINANCE.sheets.operations);
  const headers = FINANCE.headers.operations;
  const id = op.id || makeId_('TXN');
  const date = toDateOnly_(op.date) || today_();
  const now = new Date();
  const row = [
    id,
    date,
    formatMonth_(date),
    op.scope || 'Семья',
    op.type || 'Расход',
    Number(op.amount || 0),
    op.currency || FINANCE.defaultCurrency,
    op.from || '',
    op.to || '',
    op.category || '',
    op.subcategory || '',
    op.tags || '',
    op.counterparty || '',
    op.order || '',
    op.subscription || '',
    op.cardOrLoan || '',
    op.method || '',
    op.document || '',
    op.accountingRef || '',
    op.syncStatus || 'Новый',
    op.status || 'Факт',
    op.note || '',
    op.createdAt || now,
    now,
    op.user || Session.getActiveUser().getEmail() || ''
  ];

  sheet.appendRow(row);
  const rowNumber = sheet.getLastRow();
  sheet.getRange(rowNumber, 1, 1, headers.length).setVerticalAlignment('middle');
  sheet.getRange(rowNumber, 2).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(rowNumber, 6).setNumberFormat('$#,##0.00;-$#,##0.00');
  markBusinessExpenseIssues_(sheet, rowNumber);
  return id;
}

function validateOperationShape_(op) {
  const type = String(op.type || '').trim();
  const from = String(op.from || '').trim();
  const to = String(op.to || '').trim();

  if (type === 'Приход' && !to) {
    throw new Error('Для прихода выберите счет в поле "Куда".');
  }
  if ((type === 'Расход' || type === 'Платеж по кредиту' || type === 'Погашение карты') && !from) {
    throw new Error('Для расхода или платежа выберите счет списания в поле "Откуда".');
  }
  if ((type === 'Перевод' || type === 'Платеж по кредиту' || type === 'Погашение карты') && !to) {
    throw new Error('Для перевода или платежа выберите счет назначения в поле "Куда".');
  }
  if ((type === 'Перевод' || type === 'Платеж по кредиту' || type === 'Погашение карты') && from && to && from === to) {
    throw new Error('Счет списания и счет назначения должны отличаться.');
  }
}

function validateBusinessExpense_(op) {
  const scope = normalizeScope_(op.scope);
  const type = String(op.type || '').trim();
  if (scope === 'Бизнес' && type === 'Расход' && !op.order && !op.accountingRef) {
    throw new Error('Для бизнес-расхода нужен номер заказа или поле "Учет" (invoice/PO/job ID/пояснение).');
  }
}

function operationExistsForSource_(sourceId, date, sourceType) {
  const ops = getRowsAsObjects_(FINANCE.sheets.operations);
  const dateKey = formatDate_(date);
  return ops.some(function(item) {
    const op = item.object;
    if (sourceType === 'Подписка' && op.Подписка !== sourceId) return false;
    return formatDate_(op.Дата) === dateKey && op.Статус !== 'Отменено';
  });
}

function sendDailyDigest_() {
  const calendarRows = getRowsAsObjects_(FINANCE.sheets.calendar);
  const today = today_();
  const upcoming = [];
  const overdue = [];

  calendarRows.forEach(function(item) {
    const row = item.object;
    if (!row.ID || row.Статус === 'Оплачено') return;
    const date = toDateOnly_(row.Дата);
    if (!date) return;
    const days = daysBetween_(today, date);
    const notifyDays = Number(row['Напомнить за дней'] || 7);
    if (days < 0) overdue.push(row);
    if (days >= 0 && days <= notifyDays) upcoming.push(row);
  });

  if (!upcoming.length && !overdue.length) return;

  let text = 'Finance Control PRO\n';
  if (overdue.length) {
    text += '\nПросрочено:\n' + overdue.slice(0, 10).map(paymentLine_).join('\n');
  }
  if (upcoming.length) {
    text += '\n\nСкоро оплатить:\n' + upcoming.slice(0, 15).map(paymentLine_).join('\n');
  }
  sendTelegram_(text);
}

function getFinanceSummaryText_() {
  const month = formatMonth_(new Date());
  const ops = getRowsAsObjects_(FINANCE.sheets.operations);
  let familyIncome = 0;
  let familyExpense = 0;
  let businessIncome = 0;
  let businessExpense = 0;
  let businessIssues = 0;

  ops.forEach(function(item) {
    const op = item.object;
    if (op.Месяц !== month || op.Статус === 'Отменено') return;
    const amount = Number(op.Сумма || 0);
    if (op.Контур === 'Семья' && op.Тип === 'Приход') familyIncome += amount;
    if (op.Контур === 'Семья' && op.Тип === 'Расход') familyExpense += amount;
    if (op.Контур === 'Бизнес' && op.Тип === 'Приход') businessIncome += amount;
    if (op.Контур === 'Бизнес' && op.Тип === 'Расход') {
      businessExpense += amount;
      if (!op.Заказ && !op.Учет) businessIssues++;
    }
  });

  return [
    'Finance Control PRO',
    'Месяц: ' + month,
    'Семья: приход ' + formatMoney_(familyIncome) + ', расход ' + formatMoney_(familyExpense) + ', итог ' + formatMoney_(familyIncome - familyExpense),
    'Бизнес: приход ' + formatMoney_(businessIncome) + ', расход ' + formatMoney_(businessExpense) + ', итог ' + formatMoney_(businessIncome - businessExpense),
    'Бизнес-расходы без заказа/учета: ' + businessIssues
  ].join('\n');
}

function handleTelegramUpdate_(update) {
  const message = update.message || update.edited_message;
  if (!message || !message.chat) return;
  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();
  if (!text) return;

  if (text.indexOf('/start') === 0 || text.indexOf('/help') === 0) {
    sendTelegramToChat_(chatId, [
      'Finance Control PRO commands:',
      '/summary',
      '/payments',
      '/expense 125 scope=business account=BUSINESS_CHECKING cat="Материалы" order=ORDER-001 note="paint"',
      '/income 500 scope=business account=BUSINESS_CHECKING cat="Поступления от клиентов" order=ORDER-001 note="deposit"'
    ].join('\n'));
    return;
  }

  if (text.indexOf('/summary') === 0) {
    sendTelegramToChat_(chatId, getFinanceSummaryText_());
    return;
  }

  if (text.indexOf('/payments') === 0) {
    rebuildPaymentCalendar();
    const rows = getRowsAsObjects_(FINANCE.sheets.calendar)
      .map(function(item) { return item.object; })
      .filter(function(row) {
        const date = toDateOnly_(row.Дата);
        return row.ID && row.Статус !== 'Оплачено' && date && date <= addDays_(today_(), 14);
      })
      .slice(0, 15);
    sendTelegramToChat_(chatId, rows.length ? rows.map(paymentLine_).join('\n') : 'На 14 дней платежей нет.');
    return;
  }

  if (text.indexOf('/expense') === 0 || text.indexOf('/расход') === 0) {
    addTransactionFromTelegramCommand_(chatId, text, 'Расход');
    return;
  }

  if (text.indexOf('/income') === 0 || text.indexOf('/приход') === 0) {
    addTransactionFromTelegramCommand_(chatId, text, 'Приход');
    return;
  }

  sendTelegramToChat_(chatId, 'Не понял команду. Напишите /help.');
}

function addTransactionFromTelegramCommand_(chatId, text, type) {
  try {
    const parsed = parseBotTransactionCommand_(text);
    const account = parsed.account || parsed.счет || '';
    const op = {
      date: parsed.date || new Date(),
      scope: normalizeScope_(parsed.scope || parsed.контур || 'Семья'),
      type: type,
      amount: parsed.amount,
      currency: parsed.currency || parsed.валюта || FINANCE.defaultCurrency,
      from: type === 'Приход' ? (parsed.from || '') : (parsed.from || account),
      to: type === 'Приход' ? (parsed.to || account) : (parsed.to || ''),
      category: parsed.cat || parsed.category || parsed.категория || '',
      tags: parsed.tags || parsed.теги || '',
      counterparty: parsed.vendor || parsed.counterparty || parsed.контрагент || '',
      order: parsed.order || parsed.заказ || '',
      accountingRef: parsed.ref || parsed.invoice || parsed.учет || '',
      document: parsed.doc || parsed.document || parsed.документ || '',
      method: 'Telegram',
      note: parsed.note || parsed.комментарий || parsed._note || ''
    };
    const id = appendOperation_(op);
    sendTelegramToChat_(chatId, 'Сохранено: ' + id);
  } catch (error) {
    sendTelegramToChat_(chatId, 'Не сохранил: ' + error.message);
  }
}

function parseBotTransactionCommand_(text) {
  const tokens = tokenize_(text);
  if (tokens.length < 2) throw new Error('Нужна сумма. Пример: /expense 125 scope=business cat="Материалы" order=ORDER-001');
  const result = { amount: parseMoney_(tokens[1]), _note: '' };
  const amountIndex = text.indexOf(tokens[1]);
  const rest = amountIndex >= 0 ? text.slice(amountIndex + tokens[1].length) : '';
  const kvRegex = /([A-Za-zА-Яа-яЁё0-9_/-]+)=("([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match;
  while ((match = kvRegex.exec(rest)) !== null) {
    result[match[1]] = match[3] || match[4] || match[5] || '';
  }
  result._note = rest.replace(kvRegex, ' ').trim();
  if (result.date) result.date = new Date(result.date + 'T00:00:00');
  return result;
}

function tokenize_(text) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    tokens.push(match[1] || match[2] || match[3]);
  }
  return tokens;
}

function getFinanceCalendar_() {
  const id = PropertiesService.getScriptProperties().getProperty('FINANCE_CALENDAR_ID');
  if (id) {
    const calendar = CalendarApp.getCalendarById(id);
    if (calendar) return calendar;
  }
  return CalendarApp.getDefaultCalendar();
}

function createOrUpdateCalendarEvent_(calendar, eventId, title, date, description) {
  let event = null;
  if (eventId) {
    try {
      event = CalendarApp.getEventById(eventId);
    } catch (error) {
      event = null;
    }
  }
  if (event) {
    event.setTitle(title);
    event.setAllDayDate(date);
    event.setDescription(description);
    return event.getId();
  }
  event = calendar.createAllDayEvent(title, date, { description: description });
  return event.getId();
}

function sendTelegram_(text) {
  const chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');
  if (!chatId) {
    log_('WARN', 'sendTelegram_', 'TELEGRAM_CHAT_ID не задан.');
    return;
  }
  sendTelegramToChat_(chatId, text);
}

function sendTelegramToChat_(chatId, text) {
  const token = getTelegramToken_();
  if (!token) {
    log_('WARN', 'sendTelegramToChat_', 'TELEGRAM_BOT_TOKEN не задан.');
    return;
  }
  const url = 'https://api.telegram.org/bot' + encodeURIComponent(token) + '/sendMessage';
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 3900),
      disable_web_page_preview: true
    }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    log_('ERROR', 'sendTelegramToChat_', response.getContentText());
  }
}

function getTelegramToken_() {
  return PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
}

function paymentLine_(row) {
  return [
    formatDate_(row.Дата),
    row.Тип,
    row.Название,
    formatMoney_(row.Сумма, row.Валюта),
    row['Списать с'] ? 'с ' + row['Списать с'] : ''
  ].filter(Boolean).join(' | ');
}

function applyCalendarFormatting_(sheet) {
  formatSheet_(sheet, FINANCE.headers.calendar.length);
  sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('F:F').setNumberFormat('$#,##0.00;-$#,##0.00');
  const statusCol = col_(FINANCE.headers.calendar, 'Статус');
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Просрочено')
      .setBackground('#f4cccc')
      .setRanges([sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1)])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Оплачено')
      .setBackground('#d9ead3')
      .setRanges([sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1)])
      .build()
  ];
  sheet.setConditionalFormatRules(rules);
}

function formatSheet_(sheet, widthColumns) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, widthColumns)
    .setFontWeight('bold')
    .setBackground('#203864')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), widthColumns).setFontFamily('Arial');
  sheet.autoResizeColumns(1, widthColumns);
  try {
    if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), widthColumns).createFilter();
  } catch (error) {
    log_('WARN', 'formatSheet_', 'Не удалось создать фильтр: ' + error.message);
  }
}

function writeHeader_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function ensureSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Лист не найден: ' + name);
  return sheet;
}

function getHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
}

function col_(headers, headerName) {
  const index = headers.indexOf(headerName);
  if (index < 0) throw new Error('Колонка не найдена: ' + headerName);
  return index + 1;
}

function rowToObject_(headers, row) {
  const obj = {};
  headers.forEach(function(header, index) {
    obj[header] = row[index];
  });
  return obj;
}

function getRowsAsObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(String);
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const obj = rowToObject_(headers, values[i]);
    if (hasAnyValue_(values[i])) {
      rows.push({ rowNumber: i + 1, object: obj, values: values[i] });
    }
  }
  return rows;
}

function hasAnyValue_(row) {
  return row.some(function(value) {
    return value !== '' && value !== null && value !== undefined;
  });
}

function readIdNameList_(sheetName, idHeader, nameHeader, statusHeader) {
  return getRowsAsObjects_(sheetName)
    .map(function(item) { return item.object; })
    .filter(function(row) {
      if (!row[idHeader]) return false;
      if (!statusHeader) return true;
      return isActive_(row[statusHeader]);
    })
    .map(function(row) {
      return { id: row[idHeader], name: row[nameHeader] || row[idHeader] };
    });
}

function getCardsAndLoansList_() {
  const cards = readIdNameList_(FINANCE.sheets.cards, 'ID', 'Название', 'Статус');
  const loans = readIdNameList_(FINANCE.sheets.loans, 'ID', 'Название', 'Статус');
  return cards.concat(loans);
}

function removeFinanceNamedRanges_(ss) {
  ss.getNamedRanges().forEach(function(namedRange) {
    if (namedRange.getName().indexOf('Finance') === 0) {
      namedRange.remove();
    }
  });
}

function setNamedRangeFromList_(ss, sheet, name, column, length) {
  ss.setNamedRange(name, sheet.getRange(2, column, Math.max(length, 1), 1));
}

function setDynamicNamedRanges_(ss) {
  ss.setNamedRange(FINANCE.namedRanges.accounts, getSheet_(FINANCE.sheets.accounts).getRange(2, 1, 500, 1));
  ss.setNamedRange(FINANCE.namedRanges.orders, getSheet_(FINANCE.sheets.orders).getRange(2, 1, 500, 1));
  ss.setNamedRange(FINANCE.namedRanges.subscriptions, getSheet_(FINANCE.sheets.subscriptions).getRange(2, 1, 500, 1));

  const temp = getSheet_(FINANCE.sheets.refs);
  const cards = readIdNameList_(FINANCE.sheets.cards, 'ID', 'Название', 'Статус').map(function(item) { return item.id; });
  const loans = readIdNameList_(FINANCE.sheets.loans, 'ID', 'Название', 'Статус').map(function(item) { return item.id; });
  const values = cards.concat(loans).map(function(id) { return [id]; });
  const startCol = 16;
  temp.getRange(1, startCol).setValue('Карты и кредиты');
  temp.getRange(2, startCol, 500, 1).clearContent();
  if (values.length) temp.getRange(2, startCol, values.length, 1).setValues(values);
  ss.setNamedRange(FINANCE.namedRanges.cardsAndLoans, temp.getRange(2, startCol, Math.max(values.length, 1), 1));
}

function applyNamedValidation_(sheetName, headerName, namedRangeName) {
  const ss = SpreadsheetApp.getActive();
  const namedRange = ss.getRangeByName(namedRangeName);
  if (!namedRange) return;
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  const column = col_(headers, headerName);
  const range = sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(namedRange, true)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(rule);
}

function today_() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDateOnly_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string') {
    const text = value.trim();
    const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoDate) {
      return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
    }
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function addDays_(date, days) {
  const d = toDateOnly_(date);
  if (!d) return null;
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function advanceDate_(date, frequency) {
  const d = toDateOnly_(date);
  if (!d) return null;
  if (frequency === 'Еженедельно') d.setDate(d.getDate() + 7);
  else if (frequency === 'Ежеквартально') return addMonthsClamped_(d, 3);
  else if (frequency === 'Ежегодно') d.setFullYear(d.getFullYear() + 1);
  else return addMonthsClamped_(d, 1);
  return d;
}

function addMonthsClamped_(date, months) {
  const d = toDateOnly_(date);
  if (!d) return null;
  const day = d.getDate();
  const targetMonth = d.getMonth() + Number(months || 0);
  const target = new Date(d.getFullYear(), targetMonth, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

function nextDayOfMonth_(day) {
  const today = today_();
  const safeDay = Math.min(Math.max(Number(day || 1), 1), 28);
  let date = new Date(today.getFullYear(), today.getMonth(), safeDay);
  if (date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, safeDay);
  return date;
}

function daysBetween_(a, b) {
  const ms = toDateOnly_(b).getTime() - toDateOnly_(a).getTime();
  return Math.round(ms / 86400000);
}

function formatDate_(date) {
  const d = toDateOnly_(date);
  return d ? Utilities.formatDate(d, FINANCE.timezone, 'yyyy-MM-dd') : '';
}

function formatMonth_(date) {
  const d = toDateOnly_(date);
  return d ? Utilities.formatDate(d, FINANCE.timezone, 'yyyy-MM') : '';
}

function makeId_(prefix) {
  const stamp = Utilities.formatDate(new Date(), FINANCE.timezone, 'yyyyMMddHHmmss');
  const suffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return prefix + '-' + stamp + '-' + suffix;
}

function makeCalendarId_(prefix, sourceId, date) {
  return [prefix, sourceId, formatDate_(date)].join('-');
}

function parseMoney_(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const number = Number(text);
  if (!isFinite(number) || number <= 0) throw new Error('Некорректная сумма: ' + value);
  return number;
}

function formatMoney_(amount, currency) {
  const value = Number(amount || 0);
  return (currency || FINANCE.defaultCurrency) + ' ' + value.toFixed(2);
}

function normalizeScope_(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'business' || text === 'biz' || text === 'бизнес') return 'Бизнес';
  return 'Семья';
}

function isYes_(value) {
  const text = String(value || '').toLowerCase();
  return value === true || text === 'да' || text === 'yes' || text === 'true';
}

function isActive_(value) {
  const text = String(value || '').toLowerCase();
  return !text || text === 'да' || text === 'активен' || text === 'активна' || text === 'active' || text === 'true';
}

function log_(level, event, details) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(FINANCE.sheets.log);
    if (!sheet) return;
    sheet.appendRow([new Date(), level, event, details]);
  } catch (error) {
    console.log(level + ' ' + event + ' ' + details);
  }
}
