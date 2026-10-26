import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

function between(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${from} must be before ${to}`);
  return html.slice(start, end);
}

test('Services home contains the five film directions and no mixed settings wall', () => {
  const page = between('function renderCanonicalServicePricing()', 'async function loadCanonicalInstallerOperations(');
  const home = between('function renderServiceOfferingsSection()', 'function updateRemovalPrice(');
  assert.match(page, /return renderServiceOfferingsSection\(\);/);
  assert.match(home, /filmDirections\(\)\.map\(info =>/);
  assert.match(home, /data-service-direction-card=/);
  assert.match(home, />5 направлений</);
  assert.doesNotMatch(home, /SERVICE_OFFERING_DIRECTIONS\.map|general_works/);
  assert.doesNotMatch(page, /План продаж|Прайс быстрого калькулятора|Дополнительные работы/);
});

test('a direction opens a separate responsive workspace scoped to its own services', () => {
  const open = between('function openServiceDirectionDirectory(direction)', 'function closeServiceDirectionDirectory()');
  const workspace = between('function renderServiceDirectionWorkspace(direction)', 'function renderServiceOfferingsSection()');
  assert.match(open, /state\.modal = renderServiceDirectionWorkspace\(direction\)/);
  assert.match(workspace, /serviceOfferingsFor\(direction, \{ includeInactive: owner, homeOnly: true \}\)/);
  assert.match(workspace, /class="modal-content workspace-modal service-directory-modal"/);
  assert.match(workspace, /data-scroll-key="service-direction-directory"/);
  assert.match(workspace, /onclick="addServiceOffering\('\$\{direction\}'\)">\+ Добавить услугу/);
  assert.match(html, /@media \(max-width: 840px\)[\s\S]*?\.service-directory-modal \{ height: 100svh/);
});

test('adding and editing keep the canonical settings.serviceOfferings store', () => {
  const add = between('function addServiceOffering(direction)', 'function updateServiceOffering(');
  const pricing = between('function serviceOfferingPricingEditorHtml(offering, per, sized)', 'function serviceOfferingEditorHtml(offering, owner)');
  const editor = between('function serviceOfferingEditorHtml(offering, owner)', 'function renderServiceDirectionWorkspace(direction)');
  assert.match(add, /db\.settings\.serviceOfferings = serviceOfferingsAll\(\)/);
  assert.match(add, /db\.settings\.serviceOfferings\.push\(offering\)/);
  assert.match(add, /state\.servicePricingOfferingId = offering\.id/);
  assert.match(editor, /serviceOfferingPricingEditorHtml\(offering, per, sized\)/);
  assert.match(pricing, /Цена для клиента/);
  assert.match(pricing, /Оплата монтажнику/);
  assert.match(pricing, /Сохранить цены и затраты/);
  assert.match(editor, /serviceOfferingIncludesEditorHtml\(offering\)/);
  assert.match(editor, /serviceOfferingDirectionsEditorHtml\(offering\)/);
  assert.match(editor, /toggleServiceOfferingFilm/);
});
