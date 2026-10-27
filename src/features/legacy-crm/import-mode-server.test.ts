import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareServiceSolutions } from './service-solutions';

// Owner, 2026-10-27: entering old projects backdated must not be blocked by stage checks.
function state(importMode?: unknown) {
  const offering = { id: 'svc', direction: 'protective', name: 'Силикон', unit: 'lft', pricePerSqft: 5, active: true };
  return {
    settings: { serviceOfferings: [offering], ...(importMode ? { importMode } : {}) },
    users: [],
    orders: [{ id: 'o', status: 'proposal_accepted', serviceType: 'protective_film', extraServices: [{ id: 's1', type: 'offering', offeringId: 'svc', unit: 'lft', qty: 10, unitPrice: 5, price: 50 }] }],
  };
}

test('closing an unplanned project is refused normally', () => {
  const old = state();
  const next = JSON.parse(JSON.stringify(old));
  next.orders[0].status = 'completed';
  assert.match(String(prepareServiceSolutions(old, next, true)), /каждой услуги/);
});

test('with the import mode on, an old project closes without plans', () => {
  const old = state({ on: true });
  const next = JSON.parse(JSON.stringify(old));
  next.orders[0].status = 'completed';
  assert.equal(prepareServiceSolutions(old, next, false), null);
});

test('only the owner turns the import mode on', () => {
  const old = state();
  const next = JSON.parse(JSON.stringify(old));
  next.settings.importMode = { on: true };
  next.orders[0].status = 'completed';
  const byOwner = JSON.parse(JSON.stringify(next));
  assert.match(String(prepareServiceSolutions(old, next, false)), /каждой услуги/, 'a manager cannot switch it on for himself');
  assert.equal(prepareServiceSolutions(old, byOwner, true), null);
});
