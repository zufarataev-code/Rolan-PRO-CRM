import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareServiceSolutions } from './service-solutions';
import { changedProjectIds, findRefusedProject, refusalNamingProject } from './refused-project';

// Owner, 2026-11-27 10:15, on the object: the measurement of the new project
// R-261127-179 was refused with «Завершённый исторический проект может исправлять
// только владелец». A change to the closed import R-261122-165, refused the night
// before, was still on the phone and went with every save.

type Row = Record<string, any>;
const settings = { serviceOfferings: [{ id: 'a1', direction: 'smart', name: 'Smart', unit: 'sqft' }] };
const users = [{ id: 'm1', role: 'measurer' }];

function workspace(): Row {
  return {
    settings, users,
    orders: [
      {
        id: 'closed-import', number: 'R-261122-165', managerId: 'manager-a', status: 'completed',
        quickEntry: true, quickEntryDraft: false, quickProjectImportedCompleted: true,
        serviceType: 'smart_film', offeringIds: ['a1'], offeringUnits: { a1: 'sqft' }, measurements: { rooms: [] },
        extraServices: [{ id: 'line', quickProjectLine: true, offeringId: 'a1', unit: 'sqft', qty: 10, price: 100, serviceType: 'smart_film' }],
      },
      { id: 'daniel', number: 'R-261127-179', status: 'measurement_scheduled', serviceType: 'smart_film', measurements: { rooms: [] }, extraServices: [] },
    ],
  };
}

// The measurer's field save: not the owner, no manager ids, field path.
const validate = (current: Row, candidate: Row) => prepareServiceSolutions(current, candidate, false, [], true);

test('a stale change to a closed import is named, the new measurement on another project is not', () => {
  const current = workspace();
  const next = structuredClone(current);
  next.orders[0].measurements = { rooms: [{ id: 'r', name: 'Office', windows: [] }] }; // last night, refused
  next.orders[1].measurements = { rooms: [{ id: 'b', name: 'Bathroom', windows: [{ id: 'w', width: 35, height: 60, qty: 1 }] }] };

  assert.equal(validate(structuredClone(current), structuredClone(next)), 'Завершённый исторический проект может исправлять только владелец.',
    'the whole save is refused as before');
  assert.deepEqual(changedProjectIds(current, next).sort(), ['closed-import', 'daniel']);

  const refused = findRefusedProject(current, next, validate);
  assert.deepEqual(refused, { id: 'closed-import', number: 'R-261122-165', message: 'Завершённый исторический проект может исправлять только владелец.' });
  assert.equal(refusalNamingProject(refused!.message, refused), 'R-261122-165: Завершённый исторический проект может исправлять только владелец.');

  // Set aside the refused project and the rest goes through.
  const rest = structuredClone(next);
  rest.orders[0] = structuredClone(current.orders[0]);
  assert.equal(validate(structuredClone(current), rest), null, 'the measurement of R-261127-179 saves');
});

test('nothing is named when no single project is refused on its own', () => {
  const current = workspace();
  const next = structuredClone(current);
  next.settings = { ...settings, removalPricePerSqft: 9 }; // a directory change, not a project
  next.orders[1].measurements = { rooms: [{ id: 'b', windows: [] }] };
  const ownerOnlyDirectory = (c: Row, n: Row) => prepareServiceSolutions(c, n, false, [], true);
  assert.ok(ownerOnlyDirectory(structuredClone(current), structuredClone(next)));
  assert.equal(findRefusedProject(current, next, ownerOnlyDirectory), null);
  assert.equal(refusalNamingProject('Только владелец может менять справочник услуг.', null), 'Только владелец может менять справочник услуг.');
});

test('a new project and an archived move count as changes', () => {
  const current = workspace();
  const next = structuredClone(current);
  next.orders.push({ id: 'new-one', number: 'R-261127-180' });
  next.archivedOrders = [next.orders.splice(1, 1)[0]];
  assert.deepEqual(changedProjectIds(current, next).sort(), ['daniel', 'new-one']);
});

test('the save route names the refused project for every project check', async () => {
  const { readFileSync } = await import('node:fs');
  const route = readFileSync('app/api/v1/legacy-crm/state/route.ts', 'utf8');
  for (const code of ['invalid_service_approval', 'invalid_production_stage', 'invalid_service_solution', 'invalid_project_expense']) {
    assert.match(route, new RegExp(`return refuseSave\\("${code}"`), code);
  }
  assert.match(route, /refused_project_id: project\.id, refused_project_number: project\.number/);
  assert.match(route, /"owner_cost_review_required"[\s\S]{0,200}refused_project_id: String\(order\.id/);
  assert.match(route, /"original_lead_protected"[\s\S]{0,250}refused_project_id: String\(order\.id/);
});
