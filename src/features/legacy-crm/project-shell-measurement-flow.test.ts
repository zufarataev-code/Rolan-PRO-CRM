import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

function slice(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return html.slice(start, end);
}

test('a project shell needs client and object, while services remain optional', () => {
  const modal = slice('function openOrderModal()', 'function offeringServiceType(');
  assert.match(modal, /Услуги проекта <span class="tag bg-slate-100 text-slate-600">необязательно<\/span>/);
  assert.match(modal, /Можно добавить услугу сейчас или после создания/);
  const gates = slice('function refreshOrderIntakeGates()', 'function selectOrderSiteType(');
  assert.match(gates, /node\.style\.display = hasSite \? '' : 'none'/);
  assert.doesNotMatch(gates, /validOffering/);
  const create = slice("function createOrder(nextStep = 'project')", 'function openClientModal()');
  assert.match(create, /if \(offering && \(!service/);
  assert.doesNotMatch(create, /Отметьте хотя бы одну активную услугу проекта/);
  assert.match(create, /save\(\); closeModal\(\);\s*openOrder\(o\.id\);/);
  assert.doesNotMatch(create, /openEngineeringMeasureStudio|openManagerMeasureModal/);
});

test('measurement keeps the daily fields visible and folds technical detail', () => {
  const studio = slice('function openEngineeringMeasureStudio(orderId)', 'function measureStudioSetScope(');
  assert.match(studio, /Комната и окно/);
  assert.match(studio, /Конструкция и размеры/);
  assert.match(studio, /Плёнка \/ материал/);
  assert.match(studio, /<details class="measure-optional-details">\s*<summary>Стекло, сторона и фасад/);
  assert.match(studio, /<details class="measure-optional-details mt-3">\s*<summary>Доступ и технические заметки/);
  assert.match(studio, /<details class="measure-optional-details measure-technical-details">/);
});

test('measurement has one persistent action bar and Save & New saves before clearing', () => {
  const studio = slice('function openEngineeringMeasureStudio(orderId)', 'function measureStudioSetScope(');
  assert.match(studio, /class="measure-global-actions"/);
  assert.match(studio, />Сохранить<\/button>/);
  assert.match(studio, />Сохранить и новое окно<\/button>/);
  assert.match(studio, />Сохранить и завершить замер<\/button>/);
  const saveAndNew = slice('function measureStudioSaveAndNew(orderId)', 'function measureStudioMarkDirty(');
  assert.match(saveAndNew, /measureStudioSaveWindow\(orderId, \{ reopen: false \}\)/);
  assert.match(saveAndNew, /measureStudioNewWindow\(orderId\)/);
  assert.ok(saveAndNew.indexOf('measureStudioSaveWindow') < saveAndNew.indexOf('measureStudioNewWindow'));
});

test('film choices are direction-safe, non-empty and deduplicated', () => {
  const filter = slice('function serviceOfferingSelectableFilms(', '// How a service is priced');
  assert.match(filter, /canonicalCatalogCategory\(film\.category\) === canonicalCatalogCategory\(offering\?\.direction\)/);
  assert.match(filter, /if \(!name && !model && film\.id !== selectedId\) return false/);
  assert.match(filter, /seen\.has\(key\)/);
  const options = slice('function measureStudioCatalogOptions(', 'function measureStudioWindowListHtml(');
  assert.match(options, /serviceOfferingSelectableFilms\(offering, selectedId\)/);
  assert.match(options, /academyEsc\(catalogLabel\(film\)\)/);
  assert.doesNotMatch(options, /academyEsc\(film\.brand\).*academyEsc\(film\.model\)/s);
});
