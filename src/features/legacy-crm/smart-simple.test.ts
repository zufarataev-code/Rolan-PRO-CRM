import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-26: «в смарте выбираешь услугу и окна — значит подключение зон:
// одно окно = одна зона, сразу. Электрика — только если требуется. Ты усложнил.»
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('a Smart service missing in the price list never blocks the estimate or the KP', () => {
  assert.doesNotMatch(fn(html, 'projectEstimateReadiness'), /smartCashierIssues/);
});

test('the electrician and the power block join only when ticked; zones always follow the windows', () => {
  assert.match(fn(html, 'syncSmartWindowPlan'), /electricianNeeded: current\.electricianNeeded === true/);
  const room = fn(html, 'syncSmartRoomPlan');
  assert.match(room, /legacy\.electricianNeeded === true/);
  assert.match(room, /powerBlockNeeded: current\.powerBlockNeeded === true/);
  const desired = fn(html, 'smartCashierDesiredLines');
  assert.match(desired, /if \(!item\.system\.powerBlockNeeded\) return;/);
  assert.match(desired, /add\('zone', zoneOffering, rooms\.reduce\(\(sum, item\) => sum \+ item\.system\.zones, 0\), rooms\);/);
  assert.match(fn(html, 'managerUpdateSmartRoom'), /field === 'powerBlockNeeded'\) system\.powerBlockNeeded = Boolean\(val\)/);
});

test('the room card: three toggles, what joins the KP, and «Создать услугу» when a service is missing', () => {
  const card = fn(stages, 'managerSmartRoomFieldsHtml');
  for (const text of ['⚡ Нужен электрик', '🔌 Нужен блок питания', 'Тип блока:', 'Мультизона — каждая зона отдельно', 'Попадёт в КП', '1 окно = 1 зона', 'Создать услугу', 'в КП не войдёт']) assert.ok(card.includes(text), text);
  const create = fn(stages, 'smartCreateOffering');
  assert.match(create, /direction: 'smart', name: base\.name, unit: base\.unit, pricePerSqft: price/);
  assert.match(create, /if \(!\(price > 0\)\)/);
  assert.equal(fn(stages, 'smartRoleDefaults').includes("zone: { name: 'Подключение зоны', unit: 'zone' }"), true);
});

test('the multi-zone is a type of power block, not a separate service', () => {
  const desired = fn(html, 'smartCashierDesiredLines');
  assert.match(desired, /if \(item\.system\.controlMode === 'multi'\) \{ add\('multi', smartCashierOffering\('multi'\), 1, \[item\]\); return; \}/);
  assert.doesNotMatch(desired, /multiRooms/);
  assert.equal(fn(stages, 'smartRoleDefaults').includes("multi: { name: 'Блок питания мультизона', unit: 'piece' }"), true);
  assert.match(fn(stages, 'quickMeasureHtml'), /\['multi', 'Мультизона — каждая зона отдельно'\]/);
});
