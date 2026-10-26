import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("measurement workspace focuses on one site-specific space and a four-step flow", () => {
  assert.match(legacyCrm, /manager-measure-progress/);
  assert.match(legacyCrm, /function roomTermsForOrder/);
  assert.match(legacyCrm, /Офисы \/ зоны/);
  assert.match(legacyCrm, /Комнаты дома/);
  assert.match(legacyCrm, /managerActiveRoom\(o\)/);
  assert.match(legacyCrm, /managerSelectRoom/);
  assert.match(legacyCrm, /Материал и проверка/);
});

test("measurement workspace keeps costing and cutting out of the primary input view", () => {
  assert.match(legacyCrm, /<details class="manager-results-panel"/);
  assert.match(legacyCrm, /Проверка материала и результат/);
  assert.doesNotMatch(
    legacyCrm.slice(
      legacyCrm.indexOf("function renderManagerMeasureModal"),
      legacyCrm.indexOf("function openManagerMeasureModal"),
    ),
    /manager-measure-table/,
  );
});

test("measurement material picker is scoped to the selected service category", () => {
  assert.match(legacyCrm, /function canonicalCatalogCategory\(value\)/);
  assert.match(legacyCrm, /safety_film: 'protective'/);
  // Privacy is its own direction since 2026-10-05.
  assert.match(legacyCrm, /privacy: 'privacy', privacy_film: 'privacy'/);
  assert.match(legacyCrm, /function catalogMatchesCategory\(catalog, category\)/);
  assert.match(legacyCrm, /function managerWarehouseFilmItems/);
  assert.match(legacyCrm, /function managerRoomFilmPickerHtml/);
  assert.match(legacyCrm, /catalogCanBeSelected\(c, selectedId\)/);
  assert.match(legacyCrm, /catalogMatchesCategory\(c, category\) \|\| c\.id === selectedId/);
  assert.match(legacyCrm, /function catalogHasWarehouseStock\(catalogId\)/);
  assert.match(legacyCrm, /filter\(c => c\.id === selectedId \|\| catalogHasWarehouseStock\(c\.id\)\)/);
  assert.match(legacyCrm, /Категория \/ серия/);
  assert.match(legacyCrm, /Выберите бренд/);
  assert.match(legacyCrm, /Выберите модель/);
  assert.match(legacyCrm, /Показаны только модели с остатком на складе/);
  assert.match(legacyCrm, /function openManagerFilmReceiptForm/);
  assert.match(legacyCrm, /function saveManagerFilmReceipt/);
  assert.doesNotMatch(legacyCrm, /if \(!items\.length\) return managerCatalogOptionsHtml/);
});

test("new measurement rooms do not silently receive the first catalog film", () => {
  const defaults = legacyCrm.match(/function defaultCatalogIdForOrder\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  const windowDefaults = legacyCrm.match(/function managerWindowDefaults\(o, room, opts = \{\}\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(defaults, /return ''/);
  assert.doesNotMatch(defaults, /db\.settings\.catalog\.find/);
  assert.doesNotMatch(windowDefaults, /db\.settings\.catalog\.find/);
});

test("solar glass profile separates pane construction, treatment and Low-E", () => {
  assert.match(legacyCrm, /const MANAGER_GLASS_CONSTRUCTIONS/);
  assert.match(legacyCrm, /single_pane/);
  assert.match(legacyCrm, /double_pane_igu/);
  assert.match(legacyCrm, /triple_pane_igu/);
  assert.match(legacyCrm, /const MANAGER_GLASS_TREATMENTS/);
  assert.match(legacyCrm, /function managerGlassProfile\(win = \{\}\)/);
  assert.match(legacyCrm, /function saveManagerGlassProfile/);
  assert.match(legacyCrm, /w\.glassConstruction = profile\.construction/);
  assert.match(legacyCrm, /w\.glassTreatment = profile\.treatment/);
  assert.match(legacyCrm, /w\.glassLowE = profile\.lowE/);
  assert.match(legacyCrm, /Low-E покрытие/);
});

test("measurement opening follows a compact field sequence inspired by the proven TintWiz workflow", () => {
  const managerMeasurement = legacyCrm.slice(
    legacyCrm.indexOf("function renderManagerMeasureModal"),
    legacyCrm.indexOf("function openManagerMeasureModal"),
  );
  assert.match(managerMeasurement, /Направление плёнки/);
  assert.match(managerMeasurement, /Количество панелей/);
  assert.match(managerMeasurement, /Ширина \(/);
  assert.match(managerMeasurement, /Высота \(/);
  assert.match(managerMeasurement, /Площадь, sqft/);
  assert.match(managerMeasurement, /Стекло, доступ и технические характеристики/);
  assert.match(managerMeasurement, /Требуется демонтаж старой плёнки/);
  assert.match(managerMeasurement, /Внутренние примечания/);
  assert.match(managerMeasurement, /addWindowMeasurementPhoto/);
  assert.match(managerMeasurement, /manager-room-film-disclosure/);
  assert.match(legacyCrm, /function managerWindowPhotoCount/);
  assert.match(legacyCrm, /roomId,/);
  assert.match(legacyCrm, /windowId,/);
});

test("one project supports separate measurements for multiple film services", () => {
  assert.match(legacyCrm, /function orderMeasureScopes\(order\)/);
  assert.match(legacyCrm, /serviceTypes: selectedServices\.map\(item => item\.id\)/);
  assert.match(legacyCrm, /function managerSelectMeasureScope\(oid, scopeKey\)/);
  assert.match(legacyCrm, /Добавленные услуги не меняют исходное направление лида/);
  assert.match(legacyCrm, /filter\(w => \(w\.measureScope \|\| orderMeasureScope\(o\)\) === activeScopeKey\)/);
  assert.match(legacyCrm, /Добавьте размеры для каждой услуги/);
  assert.match(legacyCrm, /defaultCatalogByScope/);
});

test("Smart measurement keeps zones on windows and one power system per room", () => {
  assert.match(legacyCrm, /function syncSmartWindowPlan\(win, roomName = ''\)/);
  assert.match(legacyCrm, /const qty = Math\.max\(1, parseInt\(win\.qty\) \|\| 1\)/);
  assert.match(legacyCrm, /\n    zones,/);
  assert.match(legacyCrm, /function smartRoomMetrics\(room\)/);
  assert.match(legacyCrm, /function syncSmartRoomPlan\(room\)/);
  assert.match(legacyCrm, /blocks: 1,/);
  assert.match(legacyCrm, /Math\.ceil\(loadW \* 1\.2\)/);
  assert.match(legacyCrm, /function managerSmartWindowFieldsHtml/);
  assert.match(legacyCrm, /Зона окна/);
  assert.match(legacyCrm, /Одна физическая Smart-панель — одна зона/);
  const windowFields = legacyCrm.slice(
    legacyCrm.indexOf("function managerSmartWindowFieldsHtml"),
    legacyCrm.indexOf("function managerSmartRoomFieldsHtml"),
  );
  assert.doesNotMatch(windowFields, /Блок питания|Количество блоков|Силикон, шт\.|Нужен электрик/);
  assert.match(legacyCrm, /function managerSmartRoomFieldsHtml/);
  assert.match(legacyCrm, /1 блок на помещение/);
  assert.match(legacyCrm, /Все окна вместе/);
  assert.match(legacyCrm, /Каждая зона отдельно/);
  assert.match(legacyCrm, /Что попадёт в действующую кассу и КП/);
  assert.match(legacyCrm, /function syncSmartCashierServices\(o\)/);
  assert.match(legacyCrm, /projectOfferingLine\(item\.offering, item\.qty, 'smart_film'\)/);
  assert.match(legacyCrm, /!candidate\.smartAuto/);
  assert.match(legacyCrm, /function managerSmartMeasurementIssues/);
  assert.match(legacyCrm, /function renderSmartWorkOrderKit/);
  assert.match(legacyCrm, /Smart-плёнка<\/b><br>\$\{smart\.areaSqft\.toFixed\(2\)\} sqft/);
  assert.match(legacyCrm, /Электрические работы Smart/);
  assert.match(legacyCrm, /renderSmartWorkOrderKit\(order\)[\s\S]*?renderSmartRoomInstallationPlans\(order\)/);
  assert.match(legacyCrm, /SMART FILM INSTALLATION MAP/);
  assert.match(legacyCrm, /ROOM POWER/);
});

test("Smart room sizing selects one capacity from total room load with reserve", () => {
  const pick = (name: string) => legacyCrm.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || "";
  const factory = new Function(`
    const ROLAN_SMART_POWER_SUPPLIES = ['Rolan Control 50W','Rolan Control 100W','Rolan Control 200W','Rolan Control 300W','Rolan Control 500W','Rolan Control 1000W'];
    const windowActualAreaSqft = win => win.area;
    const measureSmartLoad = win => win.load;
    ${pick("smartPowerCapacity")}
    ${pick("smartRecommendedPowerSupply")}
    ${pick("smartWindowsInRoom")}
    ${pick("smartWindowZoneCount")}
    ${pick("smartRoomMetrics")}
    return { smartRecommendedPowerSupply, smartRoomMetrics };
  `);
  const { smartRecommendedPowerSupply, smartRoomMetrics } = factory();
  assert.equal(smartRecommendedPowerSupply(0), "");
  assert.equal(smartRecommendedPowerSupply(51), "Rolan Control 100W");
  assert.equal(smartRecommendedPowerSupply(1001), "");
  const metrics = smartRoomMetrics({ windows: [
    { measureScope: "smart_film", qty: 3, area: 30, load: 45 },
    { measureScope: "smart_film", qty: 1, area: 10, load: 15 },
    { measureScope: "solar_film", qty: 8, area: 80, load: 100 },
  ] });
  assert.equal(metrics.zones, 4);
  assert.equal(metrics.areaSqft, 40);
  assert.equal(metrics.requiredW, 72);
  assert.equal(metrics.powerSupplyModel, "Rolan Control 100W");
});

test("measurement actions preserve the active scroll position across a full modal render", () => {
  assert.match(legacyCrm, /let __pendingRenderPosition = null/);
  assert.match(legacyCrm, /function preservePositionForNextRender\(snapshot = captureRenderPosition\(\)\)/);
  assert.match(
    legacyCrm,
    /function refreshManagerMeasureModal\(oid\) \{[\s\S]*?preservePositionForNextRender\(\);[\s\S]*?render\(\);/,
  );
  assert.match(legacyCrm, /const snapshot = __pendingRenderPosition \|\| captureRenderPosition\(\)/);
  assert.match(legacyCrm, /function restoreRenderPositionStable\(snapshot\)[\s\S]*?requestAnimationFrame\(\(\) => restoreRenderPosition\(snapshot\)\)/);
  assert.match(legacyCrm, /\.manager-measure-modal \{[\s\S]*?overflow-anchor: none/);
  assert.match(legacyCrm, /\.manager-measure-body \{[\s\S]*?overflow-anchor: none/);
});

test("dense desktop workspaces override the compact generic dialog width", () => {
  assert.match(
    legacyCrm,
    /@media \(min-width: 841px\)[\s\S]*?\.modal-content\.workspace-modal\.manager-measure-modal \{[\s\S]*?max-width: 1520px/,
  );
  assert.match(
    legacyCrm,
    /\.modal-content\.workspace-modal\.erp-intake-modal \{[\s\S]*?max-width: 1280px/,
  );
  assert.match(
    legacyCrm,
    /\.modal-content\.workspace-modal\.manager-measure-modal \{[\s\S]*?max-height: 94svh/,
  );
});

test("surveyor measurement opens inside the cloud CRM instead of a local Mac file", () => {
  assert.match(
    legacyCrm,
    /function openMeasurerV25ForOrder\(oid\) \{[\s\S]*?openManagerMeasureModal\(oid\);[\s\S]*?\}/, // one window for every role (2026-10-24)
  );
  assert.doesNotMatch(legacyCrm, /MEASURER_V25_PATH/);
  assert.doesNotMatch(legacyCrm, /file:\/\/.*measurer_v2_5/);
  assert.doesNotMatch(legacyCrm, /window\.open\(measurerV25Url/);
  const orderWorkspace = legacyCrm.slice(
    legacyCrm.indexOf("function renderOrderCleanDetails"),
    legacyCrm.indexOf("function renderInstallerTechnicalWorkspace"),
  );
  assert.doesNotMatch(orderWorkspace, /Импорт JSON v2\.5/);
});

test("field measurement has distinct tablet and phone layouts without removing functions", () => {
  assert.match(legacyCrm, /measurement-studio-backdrop/);
  assert.match(legacyCrm, /measure-device-tablet/);
  assert.match(legacyCrm, /measure-device-phone/);
  assert.match(legacyCrm, /@media \(min-width:769px\) and \(max-width:1180px\)/);
  assert.match(legacyCrm, /\.measure-workbench \{ grid-column:1; grid-row:1 \/ span 2; \}/);
  assert.match(legacyCrm, /@media \(max-width:768px\)[\s\S]*?\.modal-content\.measure-modal \{[\s\S]*?height:100dvh/);
  assert.match(legacyCrm, /\.measure-panel input, \.measure-panel select, \.measure-panel textarea,[\s\S]*?min-height:44px/);
  assert.match(legacyCrm, /class="measure-panel measure-workbench"/);
  assert.match(legacyCrm, /class="space-y-3 measure-context"/);
  assert.match(legacyCrm, /class="space-y-3 measure-checklist"/);
});

test("field measurement keeps the active project context visible", () => {
  assert.match(legacyCrm, /ПОЛЕВОЙ ЗАМЕР/);
  assert.match(legacyCrm, /orderAddress\(order, client\) \|\| 'Адрес не указан'/);
  assert.match(legacyCrm, /aria-label="Полевой замер/);
});

// Owner, 2026-10-22 (iPad): the window card's field block fell into the narrow
// first column of the two-column card body and labels broke letter by letter;
// the delete button sat on its own full-width row. Guard the layout rules.
test('the window card fields span the card and never squeeze below a label width', () => {
  const css = legacyCrm.slice(legacyCrm.indexOf('.manager-window-card-body > .manager-window-fields'), legacyCrm.indexOf('.manager-window-field.wide {'));
  assert.match(css, /\.manager-window-card-body > \.manager-window-fields \{\s*grid-column: 1 \/ -1;/);
  assert.match(css, /\.manager-window-fields \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\)/);
  assert.match(css, /\.manager-window-field label \{[^}]*overflow-wrap: normal;[^}]*word-break: normal;/);
  const head = legacyCrm.slice(legacyCrm.indexOf('.manager-window-card-head {'), legacyCrm.indexOf('.manager-window-card-title {'));
  assert.match(head, /grid-template-columns: minmax\(0, 1fr\) auto auto auto;/, 'four children, four tracks');
  assert.doesNotMatch(legacyCrm, /\.manager-window-fields \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, 'no breakpoint forces two squeezed columns');
});
