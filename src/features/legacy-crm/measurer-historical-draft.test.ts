import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareServiceSolutions } from './service-solutions';
type Row = Record<string, any>;

// Owner, 2026-11-25: the measurer could not save the measurement of R-261122-166.
// (The managers' stage refusal is fixed by PR 547.)
function workspace(): Row {
  return {
    settings: { catalog: [], serviceOfferings: [{ id: 'film', name: 'A1', direction: 'protective', unit: 'sqft', pricePerSqft: 14, installerRatePerSqft: 3 }], complexityCoefs: { standard: 1 } },
    users: [{ id: 'm', role: 'manager' }, { id: 'm2', role: 'manager' }, { id: 'c', role: 'measurer' }, { id: 'i1', role: 'installer', payConfig: { type: 'per_sqft' } }],
    orders: [
      // A closed project of another manager whose stage carries a payroll snapshot.
      { id: 'closed', managerId: 'm2', status: 'completed', serviceType: 'protective_film', extraExpenses: [], extraServices: [],
        measurements: { rooms: [{ id: 'r', windows: [{ id: 'w', offeringId: 'film', width: 3048, height: 3048, qty: 1 }] }] },
        productionStages: [{ id: 'a', serviceId: 'offering:film', title: 'Монтаж', startsAt: '2026-11-10T16:00:00Z', endsAt: '2026-11-10T22:00:00Z',
          installerIds: ['i1'], responsibleId: 'i1', contractors: [], laborSharePct: 100, status: 'done', payroll: [{ userId: 'i1', amount: 30 }] }] },
      // A draft entered through the backdated one-window form, measured by «c».
      { id: 'draft', managerId: 'm', measurerId: 'c', status: 'new', quickEntry: true, quickEntryDraft: true, serviceType: 'smart_film',
        extraExpenses: [], extraServices: [], measurements: { rooms: [] } },
    ],
  };
}

test('the project measurer saves the measurement of a backdated draft', () => {
  const saved = workspace();
  const next = structuredClone(saved);
  next.orders[1].measurements = { rooms: [{ id: 'office', name: 'Офис', windows: [] }] };
  assert.equal(prepareServiceSolutions(saved, next, false, [], ['c']), null);
  // Another measurer, or a manager who is not on the project, is still refused.
  assert.equal(prepareServiceSolutions(saved, structuredClone(next), false, [], ['other']), 'Исторический проект может менять только назначенный менеджер.');
  assert.equal(prepareServiceSolutions(saved, structuredClone(next), false, ['m2']), 'Исторический проект может менять только назначенный менеджер.');
});
