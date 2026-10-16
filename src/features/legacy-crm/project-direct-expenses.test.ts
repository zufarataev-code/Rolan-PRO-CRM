import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProjectDirectExpenses } from './project-direct-expenses';
import { prepareServiceSolutions } from './service-solutions';

const state = () => ({ settings: { serviceOfferings: [] }, users: [{ id: 'i', role: 'installer' }], orders: [{
  id: 'o', managerId: 'm', status: 'proposal_sent', extraServices: [{ id: 'silicone', qty: 1, price: 0 }], extraExpenses: [] as any[],
}] });

test('assigned manager enters one expense attached to an existing work line', () => {
  const current = state(), next = state();
  next.orders[0].extraExpenses.push({ id: 'lift', type: 'rental', amount: 300, serviceId: 'line:silicone', actual: false });
  assert.equal(validateProjectDirectExpenses(current, next, false, ['m']), null);
  assert.match(validateProjectDirectExpenses(current, next, false, ['other'])!, /ответственный менеджер/);
  assert.equal(validateProjectDirectExpenses(current, next, true, []), null);
});

test('invalid cost, duplicate identity and missing service are rejected', () => {
  for (const extraExpenses of [
    [{ id: 'e', amount: -1 }], [{ id: 'e', amount: Number.NaN }],
    [{ id: 'e', amount: 3 }, { id: 'e', amount: 4 }],
    [{ id: 'e', amount: 3, serviceId: 'line:missing' }],
  ]) {
    const next = state(); next.orders[0].extraExpenses = extraExpenses;
    assert.ok(validateProjectDirectExpenses(state(), next, true, []));
  }
});

test('unchanged historical expense shapes survive ordinary saves', () => {
  const current = state(); current.orders[0].extraExpenses = [{ id: 'old', amount: '100' }];
  const next = structuredClone(current);
  next.orders[0].extraExpenses.push({ id: 'new', amount: 50, actual: true });
  assert.equal(validateProjectDirectExpenses(current, next, false, ['m']), null);
});

test('server refuses draft production assignments before acceptance, permits them after', () => {
  const current = state();
  const next: any = structuredClone(current);
  next.orders[0].serviceSchedules = [{ id: 'line:silicone', installerIds: ['i'], installationAt: '' }];
  assert.match(prepareServiceSolutions(current, next, true)!, /после принятия КП/);
  current.orders[0].status = 'proposal_accepted'; next.orders[0].status = 'proposal_accepted';
  assert.equal(prepareServiceSolutions(current, next, true), null);
});
