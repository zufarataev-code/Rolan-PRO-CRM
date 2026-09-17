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
  assert.match(source, /Удаление плёнки\$\{windowRemovalRequired\(w\)/);
  assert.match(source, /Удалить окно/);
});

test("each room exposes a service-scoped film selector and shows its selected film", () => {
  assert.match(source, /Плёнка для помещения · \$\{academyEsc\(scope\.short\)\}/);
  assert.match(source, /managerApplyFilmToRoom\('\$\{oid\}','\$\{r\.id\}',this\.value\)/);
  assert.match(source, /const roomFilm = roomCatalog \? `\$\{roomCatalog\.brand\} · \$\{roomCatalog\.model\}` : 'плёнка не выбрана'/);
  assert.match(source, /managerScopedCatalogOptionsHtml\(selectedRoomCatalog, preferredCategory\)/);
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

test("quick project entry works without dimensions and supports multiple service lines", () => {
  const opener = source.match(/function openQuickProjectEntry\(oid\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(opener, /Сначала внесите размеры/);
  assert.match(opener, /<h3>Быстрый ввод проекта<\/h3>/);
  assert.match(source, /nextStep === 'estimate'\) setTimeout\(\(\) => openQuickProjectEntry\(o\.id\)/);
  assert.match(source, /title: 'Быстрый ввод проекта'[\s\S]*?onclick: `openQuickProjectEntry/);
  assert.match(source, /function projectEstimateAddQuickLine\(oid, requestedServiceType = ''\)/);
  assert.match(source, /quickProjectLine: true, serviceType/);
  assert.match(source, /line\.price = line\.qty \* line\.unitPrice/);
  assert.match(source, /line\.unitPrice = line\.qty > 0 \? line\.price \/ line\.qty : 0/);
  assert.match(source, /projectQuickLineCatalog\(line\.serviceType, line\.catalogId\)/);
  assert.match(source, /ORDER_PRIMARY_SERVICES\.map\(service =>/);
  assert.match(source, /Метраж, sqft/);
  assert.match(source, /Цена проекта/);
  assert.match(source, /Цена \/ sqft/);
  assert.match(source, /\+ Добавить услугу/);
});

test("quick project entry derives sqft price from the imported project total and assigns installers", () => {
  const updater = source.match(/function projectEstimateUpdateQuickLine\(oid, lineId, field, value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  const installerToggle = source.match(/function projectQuickToggleInstaller\(oid, userId, enabled\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(updater, /\['qty','unitPrice','price'\]\.includes\(field\)/);
  assert.match(source, /if \(changedField === 'price'\) line\.pricingMode = 'total'/);
  assert.match(renderer, /Цена за sqft рассчитается автоматически/);
  assert.match(renderer, /projectEstimateUpdateQuickLine\('[^']+','[^']+','price',this\.value\)/);
  assert.match(renderer, /function projectQuickToggleInstaller|projectQuickToggleInstaller/);
  assert.match(renderer, /Выберите монтажников этого проекта/);
  assert.match(installerToggle, /o\.installerIds = \[\.\.\.selected\]/);
  assert.match(installerToggle, /save\(\); openQuickProjectEntry\(oid\)/);
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

test("every quick service has its own validated start and end dates", () => {
  const readiness = source.match(/function projectEstimateReadiness\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const updater = source.match(/function projectEstimateUpdateQuickLine\(oid, lineId, field, value\) \{[\s\S]*?\n\}/)?.[0] || "";
  const rendererStart = source.indexOf("function renderQuickProjectEntry");
  const rendererEnd = source.indexOf("function openQuickProjectEntry", rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.match(source, /function projectQuickDateValue\(value\)/);
  assert.match(source, /function projectQuickDateRange\(o\)/);
  assert.match(readiness, /у каждой услуги нужны даты начала и окончания/);
  assert.match(readiness, /окончание услуги не может быть раньше начала/);
  assert.match(updater, /\['startDate','endDate'\]\.includes\(field\)/);
  assert.match(updater, /Дата окончания услуги не может быть раньше даты начала/);
  assert.match(renderer, /data-label="Начало"><input type="date"/);
  assert.match(renderer, /data-label="Окончание"><input type="date"/);
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

test("quick project entry is a separate window instead of an embedded estimate table", () => {
  const estimateStart = source.indexOf("function renderProjectEstimateWorkspace");
  const estimateEnd = source.indexOf("function openProjectEstimateWorkspace", estimateStart);
  const estimateRenderer = source.slice(estimateStart, estimateEnd);
  assert.match(source, /function renderQuickProjectEntry\(o\)/);
  assert.match(source, /function openQuickProjectEntry\(oid\)/);
  assert.doesNotMatch(estimateRenderer, /1\. Быстрый ввод проекта/);
  assert.doesNotMatch(estimateRenderer, /Плёнка со склада<\/th>/);
  assert.match(estimateRenderer, /Изменить быстрый ввод/);
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
