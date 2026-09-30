import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("measurement completion routes the manager into project calculation", () => {
  assert.match(source, /Завершить замер[\s\S]*?и рассчитать проект/);
  assert.match(
    source,
    /function completeManagerMeasurement\(oid\)[\s\S]*changeStatus\(oid, 'measurement_done'\)/,
  );
  assert.match(
    source,
    /newStatus === 'measurement_done'[\s\S]*openProjectEstimateWorkspace\(orderId\)/,
  );
});

test("project calculation combines measured materials, services, expenses and margin", () => {
  assert.match(source, /function renderProjectEstimateWorkspace\(o\)/);
  assert.match(source, /1\. Замер и материалы/);
  assert.match(source, /2\. Услуги/);
  assert.match(source, /3\. Прямые расходы проекта/);
  assert.match(source, /Прибыль/);
  assert.match(source, /Маржа/);
  assert.match(source, /projectEstimateSnapshot/);
});

test("manager prices the proposal without seeing owner-only project economics", () => {
  assert.match(source, /function orderUserCanSeeInternalEconomics\(order, user = currentUser\(\)\)/);
  assert.match(source, /user\.role === 'owner' && orderUserOwns\(order, user\)/);
  assert.match(source, /canSeeInternalEconomics \? '<th class="money">Себестоимость материала<\/th>' : ''/);
  assert.match(source, /canSeeInternalEconomics \? `<section class="project-estimate-section">[\s\S]*?3\. Прямые расходы проекта/);
  assert.match(source, /canSeeInternalEconomics \? `<div><label>Расстояние, км/);
  assert.doesNotMatch(source, /projectEstimateUpdateSetting\([^\n]+['"]marketing['"]/);
  assert.match(source, /Менеджер назначает только цену продажи, которая попадёт в КП/);
  assert.match(source, /if \(!state\.orderClassicMode \|\| u\.role !== 'owner'\)/);
});

test("hidden internal expenses do not block manager proposal readiness", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(readiness, /extraExpenses/);
  assert.match(readiness, /extraServices/);
  assert.match(readiness, /orderRevenue\(o\) <= 0/);
});

test("proposal generation is blocked until the calculation is approved", () => {
  assert.match(
    source,
    /function openProfessionalKP\(oid\)[\s\S]*if \(!projectEstimateIsApproved\(o\)\)/,
  );
  assert.match(
    source,
    /async function generatePremiumProposal\(orderId\)[\s\S]*if \(!projectEstimateIsApproved\(order\)\)/,
  );
  assert.match(source, /Подтвердить расчёт и сформировать КП/);
});

test("old quoted orders are migrated without losing proposal access", () => {
  assert.match(source, /if \(o\.projectEstimateApprovedAt === undefined\)/);
  assert.match(source, /const alreadyQuoted = !!o\.proposalSentAt \|\| !!o\.proposalAcceptedAt \|\| \[/);
  assert.match(source, /o\.proposalSentAt \|\| o\.proposalAcceptedAt \|\| o\.createdAt/);
});

test("field workers cannot open project economics", () => {
  assert.match(
    source,
    /if \(!orderUserCanSeeMoney\(o, currentUser\(\)\)\) \{ alert\('Расчёт проекта доступен только владельцу и назначенному менеджеру\.'/,
  );
  assert.match(source, /canSeeMoney \? renderOrderWorkspaceTile\(\{ orderId: o\.id, key: 'estimate'/);
});

test("manual transport expense is not counted twice", () => {
  assert.match(
    source,
    /function orderManualExpensesTotal\(o\)[\s\S]*\.filter\(e => e\.type !== 'gas'\)/,
  );
});

test("proposal readiness validates the actual window instead of its room wrapper", () => {
  assert.match(
    source,
    /windows\.some\(\(\{ win \}\) => windowActualAreaSqft\(win\) <= 0\)/,
  );
  assert.match(
    source,
    /windows\.some\(\(\{ win \}\) => !windowCatalog\(win\)\)/,
  );
  assert.doesNotMatch(source, /windows\.some\(w => windowActualAreaSqft\(w\) <= 0\)/);
});

test("window and room removal checkboxes create an area-based calculated service", () => {
  assert.match(source, /function managerToggleWindowRemoval\(oid, rid, wid\)/);
  assert.match(source, /function managerSetWindowRemoval\(oid, rid, wid, enabled\)/);
  assert.match(source, /function managerSetRoomRemoval\(oid, rid, scopeKey, enabled\)/);
  assert.match(source, /Удаление плёнки со всех окон/);
  assert.match(source, /type="checkbox"[\s\S]*?managerSetWindowRemoval/);
  assert.match(source, /function orderRemovalAreaSqft\(o\)/);
  assert.match(source, /line\.price = Number\(\(area \* unitPrice\)\.toFixed\(2\)\)/);
  assert.match(source, /Требуется демонтаж старой плёнки\$\{windowRemovalRequired\(w\)/);
  assert.match(source, /Удалить окно/);
});

test("each room exposes a service-scoped film selector and shows its selected film", () => {
  assert.match(source, /Плёнка и склад · \$\{academyEsc\(scope\.short\)\}/);
  assert.match(source, /managerApplyFilmToRoom\('\$\{oid\}','\$\{room\.id\}',this\.value\)/);
  assert.match(source, /const roomFilm = roomCatalog \? `\$\{roomCatalog\.brand\} · \$\{roomCatalog\.model\}` : 'плёнка не выбрана'/);
  assert.match(source, /managerRoomFilmPickerHtml\(oid, r, selectedRoomCatalog, preferredCategory\)/);
});

test("manager can quote from customer dimensions but installation requires verified dimensions", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(readiness, /orderMeasurementVerificationIssues|windowMeasurementIsVerified/);
  assert.match(source, /measurementBasis: !measureAllWindows\(o\)\.length \? 'QUICK_LINE_ITEMS'/);
  assert.match(source, /По ним разрешено рассчитать проект и выпустить КП/);
  assert.match(source, /function orderStatusRequiresVerifiedMeasurements\(status\)/);
  assert.match(source, /'installation_scheduled','installation_accepted','installation_en_route','installation_in_progress'/);
  assert.match(source, /if \(!ensureVerifiedMeasurementsForStatus\(o, newStatus/);
});

test("new projects follow measurement before estimate and expose no quick-entry button", () => {
  const creator = source.match(/function createOrder\(nextStep = 'measure'\) \{[\s\S]*?\n\}/)?.[0] || "";
  const passport = source.match(/function orderPassportActions\(o, ctx\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(source, /createOrder\('measure'\)/);
  assert.match(source, /Создать и перейти к замеру →/);
  assert.match(creator, /nextStep === 'measure'\) setTimeout\(\(\) => openManagerMeasureModal\(o\.id\)/);
  assert.doesNotMatch(creator, /quickProjectLine: true/);
  assert.doesNotMatch(source, /title: 'Быстрый ввод проекта'[\s\S]*?onclick: `openQuickProjectEntry/);
  assert.match(passport, /const stage = !done\.measure[\s\S]*?!done\.estimate/);
  assert.match(passport, /disabled: !ctx\.canManage \|\| !ctx\.hasMeasurements/);
});

test("accepted proposal must pass production preparation before installation", () => {
  const nextAction = source.match(/function orderPrimaryNextAction\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const scheduler = source.match(/function scheduleInstallationPrompt\(oid\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(source, /function projectProductionReadiness\(o, \{ requireReady = true \} = \{\}\)/);
  assert.match(source, /КП ещё не принято клиентом/);
  assert.match(source, /аванс ещё не получен/);
  assert.match(source, /недостаточно материала/);
  assert.match(nextAction, /title: 'Подготовить производство'/);
  assert.match(source, /function confirmProjectProductionReady\(oid\)/);
  assert.match(source, /o\.productionReadyAt = new Date\(\)\.toISOString\(\)/);
  assert.match(scheduler, /ensureProductionReadyForInstallation\(o\)/);
  assert.match(source, /'Производство','stepInstallation'/);
});

test("quick project entry derives sqft price and defers installers to Montage", () => {
  const updater = source.match(/function projectEstimateUpdateQuickLine\(oid, lineId, field, value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  const schedule = source.match(/function confirmScheduleInstallation\(oid\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(updater, /\['qty','unitPrice','price'\]\.includes\(field\)/);
  assert.match(source, /if \(changedField === 'price'\) line\.pricingMode = 'total'/);
  assert.match(renderer, /Цена за sqft рассчитается автоматически/);
  assert.match(renderer, /projectEstimateUpdateQuickLine\('[^']+','[^']+','price',this\.value\)/);
  assert.doesNotMatch(renderer, /data-label="Исполнители"/);
  assert.doesNotMatch(renderer, /\+ Новый сотрудник/);
  assert.match(renderer, /Монтаж позже/);
  assert.match(renderer, /Только для переноса уже завершённого проекта из старой CRM/);
  assert.match(schedule, /line\.installerIds = \[\.\.\.o\.installerIds\]/);
  assert.match(schedule, /line\.startDate = dt\.slice\(0, 10\)/);
  assert.match(source, /filter\(line => line\.unit === 'sqft' && \(line\.installerIds \|\| \[\]\)\.includes\(user\?\.id\)\)/);
  assert.match(source, /new Set\(line\.installerIds \|\| \[\]\)\.size/);
});

test("employee creation remains in Team and is not offered in quick commercial entry", () => {
  const submitter = source.match(/async function submitTeamMember\(quickOrderId = '', quickLineId = ''\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(source, /function openTeamMemberForm\(quickOrderId = '', quickLineId = ''\)/);
  assert.match(submitter, /legacyUserId = 'u_' \+ uid\(\)/);
  assert.match(submitter, /JSON\.stringify\(\{ fullName, email, password, roles, legacyUserId \}\)/);
  assert.match(submitter, /db\.users\.push\(/);
  assert.match(submitter, /line\.installerIds = \[\.\.\.new Set/);
  assert.match(submitter, /state\.quickTeamReturn = \{ orderId: quickOrderId/);
  assert.match(source, /function finishTeamPasswordResult\(\)/);
  assert.match(source, /return openQuickProjectEntry\(target\.orderId\)/);
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.doesNotMatch(renderer, /openTeamMemberForm/);
});

test("quick service can create warehouse film with category, name and model", () => {
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  const saver = source.match(/function saveQuickProjectFilm\(oid, lineId, category\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(renderer, /\+ Добавить плёнку на склад/);
  assert.match(source, /id="qf-category"[^>]*placeholder="Зеркальная"/);
  assert.match(source, /id="qf-name"[^>]*placeholder="Prime"/);
  assert.match(source, /id="qf-model"[^>]*placeholder="NE2"/);
  assert.match(saver, /filmCategory, productName, modelCode/);
  assert.match(saver, /db\.settings\.catalog\.push\(catalog\)/);
  assert.match(saver, /addInventoryRoll\(/);
  assert.match(saver, /recordInventoryMovement\(/);
  assert.match(saver, /line\.catalogId = catalog\.id/);
});

test("quick service adds stock supplies and includes their purchase cost", () => {
  const completionIssues = source.match(/function projectQuickCompletionIssues\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const consumables = source.match(/function orderConsumablesExpense\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(source, /function projectQuickAddSupply\(oid, lineId\)/);
  assert.match(source, /function openQuickProjectSupplyForm\(oid, lineId\)/);
  assert.match(source, /function saveQuickProjectSupply\(oid, lineId\)/);
  assert.match(source, /function projectQuickRequiredSupplies\(o, lines = projectQuickLines\(o\)\)/);
  assert.match(source, /demand\[item\.supplyId\] = \(demand\[item\.supplyId\] \|\| 0\) \+ \(Number\(item\.qty\) \|\| 0\)/);
  assert.match(source, /line\.supplyItems\.push\(/);
  assert.match(source, /costPerUnit/);
  assert.match(completionIssues, /есть незаполненный расходник услуги/);
  assert.match(completionIssues, /на складе недостаточно расходников/);
  assert.match(consumables, /projectQuickSupplyCost\(o\)/);
});

test("owner can close a completed legacy project directly from quick entry", () => {
  const closer = source.match(/function closeQuickProjectAsCompleted\(oid\) \{[\s\S]*?\n\}/)?.[0] || "";
  const completionIssues = source.match(/function projectQuickCompletionIssues\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.match(renderer, /Закрытие проекта из старой CRM/);
  assert.match(renderer, /Дата полной оплаты/);
  assert.match(renderer, /Способ оплаты/);
  assert.match(renderer, /Закрыть как выполненный и оплаченный/);
  assert.match(completionIssues, /ignoredHistoricalStockIssues/);
  assert.match(completionIssues, /warehouseCatalogCostPerSqft\(line\.catalogId\) <= 0/);
  assert.match(closer, /currentUser\(\)\?\.role !== 'owner'/);
  assert.match(closer, /o\.status = 'completed'/);
  assert.match(closer, /o\.installationDoneAt = o\.installationDoneAt \|\| endAt/);
  assert.match(closer, /o\.paidAt = paidAt/);
  assert.match(closer, /payments\.push\(/);
  assert.match(closer, /o\.projectEstimateSnapshot =/);
  assert.match(closer, /quickProjectImportedCompleted = true/);
  assert.doesNotMatch(closer, /autoNotifyClient|notifyStatusChange|autoDeductInventoryForOrder/);
});

test("quick entry records direct project expenses before historical closure", () => {
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.match(source, /function projectQuickAddExpense\(oid, type = 'delivery'\)/);
  assert.match(source, /function projectQuickUpdateExpense\(oid, expenseId, field, value\)/);
  assert.match(source, /function projectQuickDeleteExpense\(oid, expenseId\)/);
  assert.match(source, /projectDirect: true/);
  assert.match(renderer, /Прямые расходы проекта/);
  assert.match(renderer, /\+ Добавить расход/);
  assert.match(renderer, /material_purchase/);
  assert.match(renderer, /subcontractor/);
  assert.match(renderer, /projectQuickUpdateExpense/);
});

test("quick project total remains the source while sqft changes", () => {
  const dateSource = source.match(/function projectQuickDateValue\(value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const syncSource = source.match(/function projectEstimateSyncQuickLine\(line, changedField = ''\) \{[\s\S]*?\n\}/)?.[0] || "";
  const sync = new Function(`${dateSource}; ${syncSource}; return projectEstimateSyncQuickLine;`)() as (
    line: Record<string, unknown>,
    changedField?: string,
  ) => void;
  const importedLine: Record<string, unknown> = { qty: 200, price: 5000, unitPrice: 0 };
  sync(importedLine, "price");
  assert.equal(importedLine.unitPrice, 25);
  importedLine.qty = 250;
  sync(importedLine, "qty");
  assert.equal(importedLine.price, 5000);
  assert.equal(importedLine.unitPrice, 20);

  const existingUnitPriceLine: Record<string, unknown> = { qty: 100, price: 0, unitPrice: 12 };
  sync(existingUnitPriceLine);
  assert.equal(existingUnitPriceLine.price, 1200);
});

test("quick services keep legacy dates collapsed while normal scheduling sets the start date", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const completionIssues = source.match(/function projectQuickCompletionIssues\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const updater = source.match(/function projectEstimateUpdateQuickLine\(oid, lineId, field, value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.match(source, /function projectQuickDateValue\(value\)/);
  assert.match(source, /function projectQuickDateRange\(o\)/);
  assert.doesNotMatch(readiness, /у каждой услуги нужны даты начала и окончания/);
  assert.doesNotMatch(readiness, /у каждой услуги нужен исполнитель/);
  assert.match(completionIssues, /у каждой услуги нужны даты начала и окончания/);
  assert.match(completionIssues, /окончание услуги не может быть раньше начала/);
  assert.match(updater, /\['startDate','endDate'\]\.includes\(field\)/);
  assert.match(updater, /Дата окончания услуги не может быть раньше даты начала/);
  assert.doesNotMatch(renderer, /data-label="Начало"/);
  assert.doesNotMatch(renderer, /data-label="Окончание"/);
  assert.match(renderer, /<label>Начало работ<\/label><input type="date"/);
  assert.match(renderer, /Только для переноса уже завершённого проекта из старой CRM/);
  assert.match(source, /if \(dt && !projectQuickDateValue\(line\.startDate\)\) line\.startDate = dt\.slice\(0, 10\)/);
  assert.match(source, /quickRange\.endDate \|\| quickRange\.startDate/);
  assert.match(source, /Service period: \$\{servicePeriod\}/);
});

test("quick project lines use warehouse film and never accept manual material or labor cost", () => {
  const sync = source.match(/function projectEstimateSyncQuickLine\(line, changedField = ''\) \{[\s\S]*?\n\}/)?.[0] || "";
  const updater = source.match(/function projectEstimateUpdateQuickLine\(oid, lineId, field, value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.match(source, /function projectQuickLineCatalog\(serviceType, selectedCatalogId = ''\)/);
  assert.match(source, /catalogCanBeSelected\(item, selectedCatalogId\)/);
  assert.match(source, /catalogMatchesCategory\(item, category\)/);
  assert.match(source, /warehouseCatalogStockStats\(item\.id\)\.availableSqft > 0/);
  assert.match(renderer, /Плёнка со склада/);
  assert.match(renderer, /Закупочная цена берётся из склада, оплата работ — из настроек зарплаты сотрудников/);
  assert.match(sync, /delete line\.unitCost/);
  assert.match(sync, /delete line\.cost/);
  assert.match(sync, /line\.unit = 'sqft'/);
  assert.doesNotMatch(updater, /unitCost/);
  assert.doesNotMatch(updater, /field === 'unit'/);
  assert.doesNotMatch(renderer, /Себестоимость \/ ед\./);
});

test("project estimate uses the canonical measurement basis", () => {
  const estimateStart = source.indexOf("function renderProjectEstimateWorkspace");
  const estimateEnd = source.indexOf("function openProjectEstimateWorkspace", estimateStart);
  const estimateRenderer = source.slice(estimateStart, estimateEnd);
  assert.doesNotMatch(estimateRenderer, /1\. Быстрый ввод проекта/);
  assert.doesNotMatch(estimateRenderer, /Плёнка со склада<\/th>/);
  assert.match(estimateRenderer, /Итог по замеру/);
  assert.match(estimateRenderer, /Перейти к замеру/);
  assert.match(estimateRenderer, /Обязательная основа расчёта и КП/);
});

test("project add-on rows contain customer price only and labor comes from configured work rates", () => {
  const serviceUpdater = source.match(/function projectEstimateUpdateService\(oid, sid, field, value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const estimateStart = source.indexOf("function renderProjectEstimateWorkspace");
  const estimateEnd = source.indexOf("function openProjectEstimateWorkspace", estimateStart);
  const estimateRenderer = source.slice(estimateStart, estimateEnd);
  assert.doesNotMatch(serviceUpdater, /field === 'cost'|['"]cost['"]/);
  assert.doesNotMatch(estimateRenderer, /projectEstimateUpdateService\([^\n]+,'cost'/);
  assert.match(source, /ratesByWorkType/);
  assert.match(source, /id="pc-work-\$\{type\}"/);
  assert.match(source, /function orderAdditionalWorkPayoutForUser\(o, user, installerCount = 1\)/);
  assert.match(source, /filmPayout \+ orderAdditionalWorkPayoutForUser/);
});

test("the Services reference owns installer pay while material stays in Warehouse", () => {
  const rendererStart = source.indexOf("function renderCanonicalServicePricing");
  const rendererEnd = source.indexOf("async function loadCanonicalInstallerOperations", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.doesNotMatch(renderer, /cps-\$\{row\.service_type_id\}-material/);
  assert.match(renderer, /cps-\$\{row\.service_type_id\}-installer/);
  assert.match(renderer, /Монтажнику \/ sqft, \$/);
  assert.doesNotMatch(renderer, /cpa-\$\{row\.service_addon_id\}-cost/);
  assert.match(renderer, /Стоимость плёнки берётся со склада\. Ставка монтажа из этой услуги автоматически начисляется/);
  assert.match(source, /patch\.installation_cost_per_sqft = canonicalPricingValue/);
  assert.match(source, /syncLegacyInstallerServiceRate\(service\.service_code, patch\.installation_cost_per_sqft\)/);
  assert.match(source, /syncLegacyInstallerServiceRate\(service\.service_code, service\.installation_cost_per_sqft\)/);
});

test("each manager-entered window starts preliminary and can be explicitly verified", () => {
  assert.match(source, /measurementSource: 'CUSTOMER'/);
  assert.match(source, /function managerConfirmWindowMeasurement\(oid, rid, wid\)/);
  assert.match(source, /От клиента · подтвердить точные/);
  assert.match(source, /markWindowMeasurementVerified\(w\)/);
  assert.match(source, /markWindowMeasurementUnverified\(w\)[\s\S]*invalidateProjectEstimate/);
  assert.match(source, /measurementSource: 'SURVEYOR_VERIFIED'/);
});

test("project estimate becomes stacked labeled rows on a phone", () => {
  assert.match(source, /@media \(max-width: 840px\) \{[\s\S]*?\.project-estimate-table-wrap/);
  assert.match(source, /\.project-estimate-table-wrap \{[\s\S]*?overflow: visible !important/);
  assert.match(source, /\.project-estimate-table thead \{ display: none; \}/);
  assert.match(source, /\.project-estimate-table td::before \{[\s\S]*?content: attr\(data-label\)/);
  assert.match(source, /data-label="Помещение \/ окно"/);
  assert.match(source, /data-label="Цена клиенту"/);
  assert.match(source, /data-label="Комментарий"/);
  assert.match(source, /class="project-estimate-action"/);
  assert.match(source, /Удалить услугу/);
  assert.match(source, /Удалить расход/);
  assert.match(source, /\.project-estimate-footer > div:last-child \{[\s\S]*?grid-template-columns: 1fr/);
});

test("desktop project workspaces fit fields and refresh without rebuilding the whole CRM", () => {
  assert.match(source, /\.order-workspace-modal\.order-workspace-modal-wide[\s\S]*?max-width: 1520px/);
  assert.match(source, /@media \(min-width: 841px\)[\s\S]*?\.modal-content\.workspace-modal\.order-workspace-modal\.order-workspace-modal-wide[\s\S]*?max-width: 1520px/);
  assert.match(source, /project-estimate-table project-estimate-table--quick/);
  assert.match(source, /\.project-estimate-table--quick tr[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(source, /function refreshProjectWorkspaceBody\(oid, workspace, renderer, fallback\)/);
  assert.match(source, /body\.innerHTML = renderer\(o\)/);
  assert.match(source, /data-workspace="quick-project"/);
  assert.match(source, /data-workspace="project-estimate"/);
  assert.match(source, /save\(\); refreshQuickProjectEntry\(oid\)/);
  assert.match(source, /save\(\); refreshProjectEstimateWorkspace\(oid\)/);
});

test("proposal readiness does not require installation scheduling", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const completionIssues = source.match(/function projectQuickCompletionIssues\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(readiness, /installerIds|startDate|endDate/);
  assert.match(completionIssues, /installerIds/);
  assert.match(completionIssues, /startDate/);
  assert.match(source, /Монтаж позже[\s\S]*?Бригада и дата монтажа назначаются после принятия КП/);
  assert.match(source, /Для КП данных достаточно[\s\S]*?Можно переходить к проверке расчёта/);
});

test("proposal readiness reports exact missing commercial fields", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(readiness, /не внесены помещения и размеры/);
  assert.match(readiness, /есть окна без размера/);
  assert.match(readiness, /не выбрана плёнка для всех окон/);
  assert.match(readiness, /сумма проекта равна нулю/);
  assert.doesNotMatch(readiness, /projectEstimateQuickLinesForBasis/);
});

test("fullscreen kanban fits all stages and cut sheets preserve readable scale", () => {
  assert.match(source, /\.kanban-fullscreen \.kanban-funnel[\s\S]*?grid-template-columns: repeat\(7, minmax\(220px, 1fr\)\)/);
  assert.match(source, /const minimumSegmentHeight = Math\.max\(1, run\.combos\.length\) \* 150/);
  assert.match(source, /Math\.min\(6000, Math\.max\(aspectHeight, minimumSegmentHeight\)\)/);
  assert.match(source, /нужны ширина и высота каждого стекла/);
  assert.doesNotMatch(source, /title: 'Лист раскроя'[\s\S]{0,220}disabled: !plan\.pieces/);
});

test("quick-entry records are calculation input only for completed historical imports", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const revenue = source.match(/function orderExtraServicesRevenue\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const snapshot = source.match(/function premiumCanonicalSnapshot\(prop\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(source, /function projectEstimateQuickLinesForBasis\(o\)/);
  assert.match(source, /return o\?\.quickProjectImportedCompleted === true \? projectQuickLines\(o\) : \[\]/);
  assert.doesNotMatch(readiness, /projectEstimateQuickLinesForBasis/);
  assert.match(readiness, /if \(!windows\.length\)/);
  assert.match(revenue, /filter\(line => !line\.quickProjectLine \|\| !measuredProject\)/);
  assert.match(snapshot, /projectEstimateQuickLinesForBasis\(order\)\.forEach/);
  assert.match(source, /Расчёт идёт по замеру/);
  assert.match(source, /пустая строка больше не блокирует документ/);
});

test("proposal actions remain locked until the measured estimate is approved", () => {
  assert.match(source, /const proposalDisabled = !canManage \|\| !estimateApproved;/);
  assert.match(source, /title: 'Единое КП'[\s\S]*?disabled: !canManage \|\| !estimateApproved/);
  assert.match(source, /Показать, чего не хватает/);
  assert.match(source, /summary: workDocsOnly \? 'Без коммерческих сумм'[\s\S]*?'Откройте расчёт и проверьте итог'/);
  assert.doesNotMatch(source, /estimateApproved \? 'КП' : 'заблокировано'/);
  assert.doesNotMatch(
    source,
    /onclick="approveProjectEstimateAndOpenProposal\('\$\{o\.id\}'\)" \$\{issues\.length \? 'disabled' : ''\}/,
  );
});


test("historical quick import can retain a manual film but live proposals require catalog material", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const updater = source.match(/function projectEstimateUpdateQuickLine\(oid, lineId, field, value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  const completionIssues = source.match(/function projectQuickCompletionIssues\(o\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(source, /function projectQuickManualFilmName\(line\)/);
  assert.match(readiness, /!windowCatalog\(win\)/);
  assert.match(updater, /field === 'manualFilmName'/);
  assert.match(updater, /line\.catalogId = ''/);
  assert.match(renderer, /Плёнки нет в списке/);
  assert.match(renderer, /Ручной ввод · не привязано к складу/);
  assert.match(renderer, /currentUser\(\)\?\.role === 'owner'[\s\S]*\+ Добавить плёнку на склад/);
  assert.match(completionIssues, /ручную плёнку нужно привязать к складу перед закрытием/);
  assert.match(source, /item_kind: line\.catalogId \|\| projectQuickManualFilmName\(line\) \? 'film' : 'service'/);
});

test("kanban cannot bypass the client-to-measurement-to-proposal-to-installation workflow", () => {
  const transition = source.match(/function orderWorkflowTransitionIssues\(o, newStatus\) \{[\s\S]*?\n\}/)?.[0] || "";
  const changeStatus = source.match(/function changeStatus\(orderId, newStatus, by, opts = \{\}\) \{[\s\S]*?\n\}/)?.[0] || "";
  const kanbanMove = source.match(/function kanbanMoveOrder\(orderId, targetStatus\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(transition, /newStatus === 'measurement_scheduled'/);
  assert.match(transition, /orderMeasurementCompletionIssues\(o\)/);
  assert.match(transition, /projectEstimateIsApproved\(o\)/);
  assert.match(transition, /publishedPremiumProposalForOrder\(o\.id\)/);
  assert.match(transition, /назначьте монтажников/);
  assert.match(changeStatus, /ensureOrderWorkflowTransition\(o, newStatus/);
  assert.match(kanbanMove, /return changeStatus\(orderId, targetStatus/);
  assert.doesNotMatch(kanbanMove, /changeStatus\(orderId, targetStatus[^\n]+\n\s*return true/);
});

test("a manager can price from customer dimensions; technical survey details gate installation", () => {
  const readiness = source.match(/function orderMeasurementCompletionIssues\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const technical = source.match(/function orderTechnicalMeasurementIssues\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const completion = source.match(/function completeManagerMeasurement\(oid\) \{[\s\S]*?\n\}/)?.[0] || "";
  const transitions = source.match(/function orderWorkflowTransitionIssues\(o, newStatus\) \{[\s\S]*?\n\}/)?.[0] || "";

  // Estimate/KP readiness: dimensions, quantity and warehouse film only.
  assert.match(readiness, /windowActualAreaSqft\(win\) <= 0/);
  assert.match(readiness, /!windowCatalog\(win\)/);
  assert.doesNotMatch(readiness, /managerSmartMeasurementIssues|managerSolarMeasurementIssues/);

  // Facade side, inside/outside, access, glass type and Smart wiring are
  // confirmed by the surveyor and block installation scheduling.
  assert.match(technical, /managerSolarMeasurementIssues\(o\)/);
  assert.match(technical, /managerSmartMeasurementIssues\(o\)/);
  assert.match(transitions, /newStatus === 'installation_scheduled'[\s\S]*orderTechnicalMeasurementIssues\(o\)/);

  // The manager is told what the surveyor still has to confirm, without being blocked.
  assert.match(completion, /orderMeasurementCompletionIssues\(o\)/);
  assert.match(completion, /orderTechnicalMeasurementIssues\(o\)/);
  assert.match(completion, /До назначения монтажа замерщик должен уточнить/);

  // A refused installation schedule must not leave installers or dates on the order.
  const schedule = source.match(/function confirmScheduleInstallation\(oid\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(schedule.indexOf("orderTechnicalMeasurementIssues(o)") < schedule.indexOf("o.installerIds = Array.from"));
  assert.match(schedule, /o\.installerIds = previous\.installerIds/);
});

test("published proposals synchronize the order stage milestone", () => {
  const generator = source.match(/async function generatePremiumProposal\(orderId\) \{[\s\S]*?\n\}/)?.[0] || "";
  const sender = source.match(/async function premiumSendCanonicalProposal\(token\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(generator, /order\.proposalSentAt = order\.proposalSentAt \|\| prop\.sentAt/);
  assert.match(sender, /order\.proposalSentAt = order\.proposalSentAt \|\| prop\.sentAt/);
});

test("solar measurement requires glass, facade, installation side and access complexity", () => {
  const readiness = source.match(/function managerSolarMeasurementIssues\(order\) \{[\s\S]*?\n\}/)?.[0] || "";
  const accessSync = source.match(/function managerSyncOrderComplexityFromWindows\(o\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(readiness, /укажите тип стекла/);
  assert.match(readiness, /укажите сторону фасада/);
  assert.match(readiness, /внутреннюю или наружную установку/);
  assert.match(readiness, /выберите доступ и высоту/);
  assert.match(source, /Маленькая лестница/);
  assert.match(source, /Большая лестница \/ выше 10 ft/);
  assert.match(source, /Леса \/ тура/);
  assert.match(source, /Подъёмник \/ scissor lift/);
  assert.match(accessSync, /o\.complexity = complexities/);
});

test("solar estimate exposes optimized film waste and warehouse consumption", () => {
  const estimateStart = source.indexOf("function renderProjectEstimateWorkspace");
  const estimateEnd = source.indexOf("function openProjectEstimateWorkspace", estimateStart);
  const estimate = source.slice(estimateStart, estimateEnd);
  assert.match(estimate, /Расход плёнки/);
  assert.match(estimate, /Отход раскроя/);
  assert.match(estimate, /filmPlan\.wastePct/);
  assert.match(estimate, /Материал со склада/);
});

test("manager-approved payment after completion is explicit and auditable", () => {
  const production = source.match(/function projectProductionReadiness\(o, \{ requireReady = true \} = \{\}\) \{[\s\S]*?\n\}/)?.[0] || "";
  const calculator = source.match(/function premiumPaymentDue\(prop, calc\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(source, /function projectEstimateConfirmPostpay\(oid, confirmed\)/);
  assert.match(source, /paymentTermsConfirmedBy = confirmed \? state\.currentUserId/);
  assert.match(source, /function orderPaymentReadyForProduction\(o\)/);
  assert.match(production, /orderPaymentReadyForProduction\(o\)/);
  assert.match(calculator, /mode === 'after_completion'/);
  assert.match(source, /Pay After Completion/);
});

test("proposal includes technical solar facts and written change-order acceptance", () => {
  assert.match(source, /Façade:/);
  assert.match(source, /Access:/);
  assert.match(source, /Cutting waste/);
  assert.match(source, /PREMIUM_AGREEMENT_ITEMS/);
  assert.match(source, /change to price, material or scope must be documented and approved in writing/);
  assert.match(source, /PREMIUM_AGREEMENT_ITEMS\.every/);
});

test("residential premium proposal applies the California home-improvement deposit cap", () => {
  const calculator = source.match(/function premiumProposalCalc\(prop\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(calculator, /orderSiteType\(order\) === 'RESIDENTIAL'/);
  assert.match(calculator, /Math\.min\(result\.total \* 0\.10, 1000\)/);
  assert.match(source, /Legal Deposit \(max 10% \/ \$1,000\)/);
});
