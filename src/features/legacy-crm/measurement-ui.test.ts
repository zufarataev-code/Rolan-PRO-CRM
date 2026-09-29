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
  assert.match(legacyCrm, /privacy_film: 'decorative'/);
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

test("one project supports separate measurements for multiple film services", () => {
  assert.match(legacyCrm, /function orderMeasureScopes\(order\)/);
  assert.match(legacyCrm, /serviceTypes: selectedServices\.map\(item => item\.id\)/);
  assert.match(legacyCrm, /function managerSelectMeasureScope\(oid, scopeKey\)/);
  assert.match(legacyCrm, /Добавленные услуги не меняют исходное направление лида/);
  assert.match(legacyCrm, /filter\(w => \(w\.measureScope \|\| orderMeasureScope\(o\)\) === activeScopeKey\)/);
  assert.match(legacyCrm, /Добавьте размеры для каждой услуги/);
  assert.match(legacyCrm, /defaultCatalogByScope/);
});

test("Smart measurement creates zones, equipment and an installation scheme for the work order", () => {
  assert.match(legacyCrm, /function syncSmartWindowPlan\(win, roomName = ''\)/);
  assert.match(legacyCrm, /const qty = Math\.max\(1, parseInt\(win\.qty\) \|\| 1\)/);
  assert.match(legacyCrm, /\n    zones,/);
  assert.match(legacyCrm, /siliconeRequired: current\.siliconeRequired !== false/);
  assert.match(legacyCrm, /function managerSmartWindowFieldsHtml/);
  assert.match(legacyCrm, /Smart-комплект и подключение/);
  assert.match(legacyCrm, /Зон подключения/);
  assert.match(legacyCrm, /Количество зон равно количеству окон/);
  assert.match(legacyCrm, /Блок питания/);
  assert.match(legacyCrm, /Силикон, шт\./);
  assert.match(legacyCrm, /Нужен электрик/);
  assert.match(legacyCrm, /function managerSmartMeasurementIssues/);
  assert.match(legacyCrm, /function renderSmartWorkOrderKit/);
  assert.match(legacyCrm, /Smart-плёнка<\/b><br>\$\{smart\.areaSqft\.toFixed\(2\)\} sqft/);
  assert.match(legacyCrm, /Электрические работы Smart/);
  assert.match(legacyCrm, /renderSmartWorkOrderKit\(order\)[\s\S]*?renderSmartRoomInstallationPlans\(order\)/);
  assert.match(legacyCrm, /SMART FILM INSTALLATION MAP/);
  assert.match(legacyCrm, /POWER BLOCK/);
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
