import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const seed = readFileSync('prisma/seed.ts', 'utf8');

function readOfficialSupplierSeed() {
  const catalogExpression = html.match(
    /const OFFICIAL_SUPPLIER_CATALOG = ([\s\S]*?);\n\nconst OFFICIAL_SUPPLIERS/,
  )?.[1];
  const suppliersExpression = html.match(
    /const OFFICIAL_SUPPLIERS = ([\s\S]*?);\n\nfunction ensureOfficialSupplierCatalog/,
  )?.[1];
  assert.ok(catalogExpression);
  assert.ok(suppliersExpression);
  return {
    catalog: new Function(`return ${catalogExpression}`)() as Array<Record<string, unknown>>,
    suppliers: new Function(`return ${suppliersExpression}`)() as Array<Record<string, unknown>>,
  };
}

test('warehouse separates stock, procurement, suppliers and movement journal', () => {
  assert.match(html, /Склад и снабжение/);
  assert.match(html, /Закупки/);
  assert.match(html, /Поставщики/);
  assert.match(html, /Журнал прихода и списания/);
});

test('purchase requests require an assignee and can link to a project', () => {
  assert.match(html, /Назначьте ответственного за закупку/);
  assert.match(html, /const orderId=document\.getElementById\('pr-order'\)/);
  assert.match(html, /responsibleId/);
  assert.match(html, /purchaseRequestId/);
});

test('manager can create a project purchase request from a film shortage', () => {
  assert.match(html, /function openProjectFilmPurchaseRequest\(orderId, catalogId\)/);
  assert.match(html, /Создать заявку на закупку/);
  assert.match(html, /projectFilmShortageSnapshot\(orderId, catalogId\)/);
  assert.match(html, /activeProjectFilmPurchaseRequest\(orderId,itemId\)/);
  assert.match(html, /order\.purchaseRequestIds=Array\.from\(new Set/);
  assert.match(html, /key:'purchase_requested'/);
  assert.match(html, /Allocate the widest cuts first and consume each real roll only once/);
});

test('warehouse movements reject negative stock and support QR labels', () => {
  assert.match(html, /Недостаточно на складе/);
  assert.match(html, /Недостаточно плёнки/);
  assert.match(html, /RP-ROLL-/);
  assert.match(html, /RP-SUP-/);
  assert.match(html, /openWarehouseQr/);
});

test('film warehouse opens categories before models and rolls', () => {
  assert.match(html, /function renderFilmCategoryDirectory\(\)/);
  assert.match(html, /Плёнка по категориям/);
  assert.match(html, /function openFilmWarehouseCategory\(category\)/);
  assert.match(html, /function renderFilmCategoryModels\(category\)/);
  assert.match(html, /Выберите модель, чтобы увидеть её рулоны/);
  assert.match(html, /function renderFilmModelStock\(catalogId\)/);
  assert.match(html, /if \(!category\) return renderFilmCategoryDirectory\(\);/);
  assert.match(html, /if \(model\) return renderFilmModelStock\(model\);/);
});

test('film category navigation reuses existing catalog and inventory records', () => {
  assert.match(html, /function filmWarehouseRolls\(catalogId\)[\s\S]*?db\.inventory/);
  assert.match(html, /function renderFilmCategoryModels\(category\)[\s\S]*?db\.settings\.catalog/);
  assert.match(html, /state\.inventoryFilmCategory=film\?\.category\|\|null;state\.inventoryFilmModel=roll\.catalogId\|\|null/);
});

test('Magnitronic Solar Prime series is seeded with verified meter readings', () => {
  for (const model of ['SP-5%', 'SP-15%', 'SP-20%', 'SP-35%', 'SP-50%', 'SP-70%']) {
    assert.match(html, new RegExp(model.replace('%', '%')));
    assert.match(seed, new RegExp(model.replace('%', '%')));
  }
  assert.match(html, /'SP05': \{ vlt: 5\.7,\s+tser: 93\.3, uv: 100\.0, ir: 95\.6 \}/);
  assert.match(html, /'SP70': \{ vlt: 68\.0, tser: 63\.6, uv: 99\.2,\s+ir: 99\.4 \}/);
  assert.match(html, /ensureMagnitronicSolarPrimeSeries\(s\.catalog\);/);
  assert.match(html, /brand: 'Rolan PRO'/);
  assert.match(html, /series: 'Magnitronic Solar Prime'/);
  assert.match(seed, /"ROLANPRO", "Rolan PRO", "Rolan PRO"/);
  assert.match(seed, /"Magnitronic Solar Prime SP-5%", "Magnitronic Solar Prime SP-5%"/);
  assert.match(html, /retailPerSqft: null/);
  assert.match(html, /costPerSqft: null/);
});

test('official supplier cards and confirmed catalogs are seeded without invented commercial data', () => {
  const { catalog, suppliers } = readOfficialSupplierSeed();
  assert.deepEqual(
    suppliers.map((supplier) => supplier.name),
    ['Madico', 'LLumar', 'Johnson Window Films', 'NEXFIL', 'Armolan'],
  );
  assert.deepEqual(
    Object.fromEntries(
      suppliers.map((supplier) => [
        supplier.name,
        catalog.filter((item) => item.vendorId === supplier.id).length,
      ]),
    ),
    { Madico: 4, LLumar: 27, 'Johnson Window Films': 14, NEXFIL: 15, Armolan: 19 },
  );
  assert.equal(catalog.length, 79);
  assert.equal(catalog.some((item) => 'sku' in item || 'price' in item || 'warranty' in item), false);
  assert.equal(suppliers.every((supplier) => Array.isArray(supplier.sourceUrls)), true);
  assert.match(html, /retailPerSqft:null, costPerSqft:null/);
  assert.match(html, /ensureOfficialSupplierCatalog\(s\.catalog, db\.vendors\);/);
  assert.match(html, /vendorIds\.set\(source\.id,vendor\.id\)/);
  assert.match(html, /if \(!item\.vendorId \|\| item\.vendorId===source\.vendorId\) item\.vendorId=vendorIds\.get\(source\.vendorId\)\|\|source\.vendorId/);
  assert.match(html, /db\._officialSupplierCatalogV1 = true/);
  assert.match(html, /persistOfficialSupplierMigration = !db\._officialSupplierCatalogV1/);
  assert.match(html, /persistClientNotificationMigration \|\| persistOfficialSupplierMigration \|\| roleWasSynchronized/);
});

test('reorder creates one supplier-linked draft and explicit send is required', () => {
  assert.match(html, /function ensureAutoDraftPurchaseRequests\(\)/);
  assert.match(html, /activeReorderPurchaseRequest\(need\.kind, need\.id, need\.vendorId\)/);
  assert.match(html, /status:'draft', source:'auto_reorder'/);
  assert.match(html, /function save\(\) \{\s*if \(db\?\.purchaseRequests && db\?\.vendors && db\?\.settings\?\.catalog\) ensureAutoDraftPurchaseRequests\(\);/);
  assert.match(html, /!\['received','cancelled'\]\.includes\(p\.status\)/);
  assert.match(html, /function sendPurchaseRequest\(id\)/);
  assert.match(html, /confirm\(`Отправить \$\{p\.number\}/);
  assert.match(html, /procurementEmailApi\('\/messages'/);
  assert.match(html, /purchase_request_id:p\.id/);
  assert.ok(html.indexOf("const sent=await procurementEmailApi('/messages'") < html.indexOf("p.status='requested'"));
  assert.match(html, /purchaseRequestSendsInFlight\.has\(id\)/);
  assert.match(html, /purchaseRequestSendsInFlight\.add\(id\)/);
  assert.match(html, /purchaseRequestSendsInFlight\.delete\(id\)/);
  assert.match(html, /await cloudPersistConfirmed\(\)/);
  assert.match(html, /function cloudPersistConfirmed\(\)/);
  assert.match(html, /workspace_revision/);
  assert.match(html, /expected_revision:cloudRevision/);
  assert.match(html, /function safeHttpUrl\(value\)/);
  assert.match(html, /\['http:','https:'\]\.includes\(parsed\.protocol\)/);
  assert.match(html, /черновик не отмечен отправленным/);
  assert.match(html, /function openPurchaseRequestVendorModal\(id\)/);
  assert.match(html, /if\(!vendorId\) return alert\('Выберите поставщика/);
  assert.match(html, /function cancelPurchaseRequest\(id\)/);
  assert.match(html, /cancelledStockQty/);
  assert.match(html, /if\(p\.source==='auto_reorder'\)[\s\S]*?if\(item\)item\.vendorId=vendorId/);
});

test('procurement actions are restricted to owner and manager', () => {
  assert.match(html, /function purchaseActionButtons\(p\) \{\s*if \(!\['owner','manager'\]\.includes\(currentUser\(\)\?\.role\)\) return '';/);
  assert.match(html, /function openPurchaseRequestModal[\s\S]*?Закупки доступны владельцу и менеджеру/);
  assert.match(html, /async function sendPurchaseRequest[\s\S]*?Закупки доступны владельцу и менеджеру/);
  assert.match(html, /function openVendorModal\(id=''\) \{ if\(!\['owner','manager'\]/);
});

test('procurement tables become touch-friendly cards on mobile', () => {
  assert.match(html, /@media \(max-width:840px\)[\s\S]*?\.procurement-table thead \{ display:none; \}/);
  assert.match(html, /\.procurement-table td::before[\s\S]*?content:attr\(data-label\)/);
  assert.match(html, /\.vendor-procurement-actions[\s\S]*?min-height:44px/);
  assert.match(html, /data-label="Материал"/);
  assert.match(html, /grid grid-cols-1 xl:grid-cols-2 gap-3/);
});
