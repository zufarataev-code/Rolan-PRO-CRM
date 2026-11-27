import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-11-27 22:40, screenshot from the object: R-261122-165, «Не сохранено:
// Завершённый исторический проект может исправлять только владелец». The project was
// closed through «Выполненные проекты»; the server lets only the owner change it, yet the
// measurement window opened for a non-owner and started the visit timer.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

function fn(src: string, name: string) {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, name);
  return src.slice(start, end + 2);
}

function open(order: Record<string, unknown>, role: string) {
  const calls = { alert: [] as string[], rendered: 0, ticker: 0 };
  const ctx = vm.createContext({
    state: { modal: '' },
    getOrder: () => order,
    currentUser: () => ({ id: 'u1', role }),
    projectEditBlocked: () => false,
    orderIsHistoricalDraft: () => false,
    openQuickProjectEntry: () => {},
    renderManagerMeasureModal: () => 'MODAL',
    render: () => { calls.rendered += 1; },
    measureVisitStartTicker: () => { calls.ticker += 1; },
    alert: (text: string) => { calls.alert.push(text); },
  });
  vm.runInContext(`${fn(html, 'openManagerMeasureModal')}\nopenManagerMeasureModal('o1');`, ctx);
  return { ...calls, modal: (ctx.state as { modal: string }).modal };
}

test('a project closed through «Выполненные проекты» does not open the measurement window for a non-owner', () => {
  for (const role of ['measurer', 'manager', 'installer']) {
    const result = open({ id: 'o1', quickProjectImportedCompleted: true }, role);
    assert.equal(result.modal, '', role);
    assert.equal(result.ticker, 0, `${role}: no visit timer`);
    assert.equal(result.alert.length, 1, role);
    assert.match(result.alert[0], /только владелец/);
  }
});

test('the owner and ordinary projects still open the measurement window', () => {
  const owner = open({ id: 'o1', quickProjectImportedCompleted: true }, 'owner');
  assert.equal(owner.modal, 'MODAL');
  assert.equal(owner.ticker, 1);
  const ordinary = open({ id: 'o1' }, 'measurer');
  assert.equal(ordinary.modal, 'MODAL');
  assert.equal(ordinary.alert.length, 0);
});
