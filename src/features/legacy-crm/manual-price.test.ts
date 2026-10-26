import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { prepareServiceSolutions } from './service-solutions';

// Owner, 2026-10-26: «менеджер видит лист расчёта, и у него должна быть
// возможность писать цену вручную; перед отправкой он должен видеть всё».
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

function load(offering: any, user = { role: 'manager' }) {
  const source: any = { id: 's1', offeringId: 'svc', qty: 10, unitPrice: 5, price: 50 };
  const win: any = { id: 'w', pricePerSqft: 15 };
  const lines = [
    { key: 'q', kind: 'quantity', name: 'Силикон', offeringId: 'svc', qty: 10, price: 50, sources: [source] },
    { key: 'w', kind: 'windows', name: 'Ceramic', offeringId: 'film', qty: 42, price: 630, windows: [win], sources: [] },
  ];
  const offerings: Record<string, any> = { svc: offering, film: { id: 'film', name: 'Ceramic', pricePerSqft: 15 } };
  const alerts: string[] = [];
  const ctx: any = {
    db: { settings: { complexityCoefs: { standard: 1 } } }, alerts, source, win,
    getOrder: () => ({ id: 'o', status: 'measurement_done', complexity: 'standard' }),
    orderUserCanSeeMoney: () => true, currentUser: () => user, CLOSED_PROJECT_STATUSES: ['completed'],
    projectLines: () => lines, serviceOffering: (id: string) => offerings[id] || null,
    fmtMoney: (n: number) => `$${n}`, alert: (m: string) => alerts.push(m), projectEstimateMarkChanged: () => {}, save: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(['projectServicePriceRange'].map(n => fn(readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8'), n)).join('') + fn(stages, 'projectSetLinePrice') + fn(stages, 'projectLineUnitPrice') + fn(stages, 'projectLineListPrice') + fn(stages, 'projectLinePriceIsManual'), ctx);
  return { ctx, lines };
}

test('the manager types a price by hand for a quantity service without a corridor', () => {
  const { ctx } = load({ id: 'svc', name: 'Силикон', pricePerSqft: 5 });
  assert.equal(vm.runInContext("projectSetLinePrice('o','q','6')", ctx), true);
  assert.equal(ctx.source.unitPrice, 6);
  assert.equal(ctx.source.price, 60);
});

test('a window service takes the price per sq ft; the line shows it is manual', () => {
  const { ctx, lines } = load({ id: 'svc', name: 'Силикон', pricePerSqft: 5 });
  vm.runInContext("projectSetLinePrice('o','w','18')", ctx);
  assert.equal(ctx.win.pricePerSqft, 18);
  (lines[1] as any).price = 756;
  assert.equal(vm.runInContext('projectLinePriceIsManual({ complexity: "standard" }, projectLines()[1])', ctx), true);
});

test('the owner corridor still bounds the hand price', () => {
  const { ctx } = load({ id: 'svc', name: 'Силикон', pricePerSqft: 5, minPricePerUnit: 4, maxPricePerUnit: 8 });
  assert.equal(vm.runInContext("projectSetLinePrice('o','q','9')", ctx), false);
  assert.match(ctx.alerts[0], /от \$4 до \$8/);
  assert.equal(ctx.source.unitPrice, 5);
});

test('the server keeps a hand unit price without a corridor', () => {
  const offering = { id: 'svc', direction: 'protective', name: 'Силикон', unit: 'lft', pricePerSqft: 5, active: true };
  const old = { orders: [{ id: 'o', serviceType: 'protective_film', extraServices: [{ id: 's1', type: 'offering', offeringId: 'svc', unit: 'lft', qty: 10, unitPrice: 5, price: 50 }] }], settings: { serviceOfferings: [offering] } };
  const next = JSON.parse(JSON.stringify(old));
  next.orders[0].extraServices[0].unitPrice = 6;
  assert.equal(prepareServiceSolutions(old, next, false), null);
  const saved = next.orders[0].extraServices[0];
  assert.equal(saved.unitPrice, 6);
  assert.equal(saved.price, 60);
});

test('the price step has the inputs; the KP preview starts with what the client gets', () => {
  assert.match(fn(stages, 'projectDirectionWindowHtml'), /edit && money \? projectPriceRowHtml\(o, directionKey, line\) : lineRow\(line\)/);
  assert.match(fn(stages, 'projectPriceRowHtml'), /projectDirectionSetPrice\(/);
  assert.match(fn(stages, 'proposalWizardHtml'), /\$\{proposalWizardSummaryHtml\(o, groups, total, deposit, client\)\}/);
  const summary = fn(stages, 'proposalWizardSummaryHtml');
  for (const text of ['Проверьте перед отправкой — это получит клиент', 'нет телефона', 'нет email', 'цена вручную', 'Аванс при подписи', 'Условия']) assert.ok(summary.includes(text), text);
});
