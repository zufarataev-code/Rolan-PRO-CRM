import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-11-21 (#587): перенос выполненного проекта «Christus» не
// сохранился, кнопки «новый клиент» не было, «удалить» не работал, электрика
// $1500 без количества выпала из суммы, а даты проекта нельзя было поменять.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

const offerings: Record<string, { id: string; sized: boolean }> = {
  electric: { id: 'electric', sized: false },
  film: { id: 'film', sized: true },
};
const sandbox = (extra: Record<string, unknown> = {}) => vm.createContext({
  serviceOffering: (id: string) => offerings[id] || null,
  serviceOfferingNeedsSizes: (o: { sized: boolean }) => o.sized,
  ...extra,
});

test('a work-only service with a price and an empty quantity counts as 1, a film service still needs its sq ft', () => {
  const context: any = sandbox();
  vm.runInContext(`${fn(html, 'projectQuickDateValue')}; ${fn(stages, 'quickEntryEffectiveQty')}; ${fn(stages, 'quickEntryLineSkipReason')};
    result = {
      electric: quickEntryEffectiveQty({ offering: 'electric', qty: '', price: 1500 }),
      electricNoPrice: quickEntryEffectiveQty({ offering: 'electric', qty: '', price: '' }),
      electricTwo: quickEntryEffectiveQty({ offering: 'electric', qty: '2', price: 1500 }),
      film: quickEntryEffectiveQty({ offering: 'film', qty: '', price: 6000 }),
      filmReason: quickEntryLineSkipReason({ offering: 'film', qty: '', price: 6000, date: '2026-10-30' }),
      electricReason: quickEntryLineSkipReason({ offering: 'electric', qty: '', price: 1500, date: '2026-10-30' }),
      emptyReason: quickEntryLineSkipReason({ offering: '', qty: '', price: '' }),
      backwards: quickEntryLineSkipReason({ offering: 'electric', qty: '1', price: 1500, date: '2026-10-30', endDate: '2026-10-29' }),
    };`, context);
  assert.deepEqual({ ...context.result }, {
    electric: 1, electricNoPrice: 0, electricTwo: 2, film: 0,
    filmReason: 'укажите sq ft', electricReason: '', emptyReason: '', backwards: 'окончание раньше начала',
  });
  assert.match(fn(stages, 'quickEntryLineCalc'), /const qty = quickEntryEffectiveQty\(line, offering\);/, 'the per-service margin uses the same quantity');
  for (const name of ['quickEntryPreviewOrder', 'quickEntryCommit']) {
    assert.match(fn(stages, name), /const qty = quickEntryEffectiveQty\(line, offering\)/, `${name} uses the same quantity rule as the preview`);
  }
  assert.match(fn(stages, 'quickEntrySetLine'), /line\.qty = '1'/, 'picking a work-only service fills quantity 1');
});

test('the summary names a service that is left out of the total and splits the reserve into tax and the month fixed share', () => {
  const renderer = fn(stages, 'renderQuickEntry');
  assert.match(renderer, /Услуга \$\{[^}]+\} не входит в сумму/);
  assert.match(renderer, /Налог \(резерв\)/);
  assert.match(renderer, /Прибыль проекта/);
  assert.match(renderer, /Доля постоянных расходов месяца/);
  assert.doesNotMatch(renderer, /Резерв расходов и налога/, 'the lumped reserve line is gone');
  assert.match(renderer, /Кол-во, \$\{sized \? 'sq ft' : academyEsc\(serviceOfferingUnitShort\(offering\)\)\}/);
  assert.match(renderer, /Материал не нужен — только работа/);
});

test('changing the project start or end moves the matching service dates, and an end before a service start is refused', () => {
  const run = (lines: any[], edge: string, value: string) => {
    const alerts: string[] = [];
    const context: any = vm.createContext({
      lines, alerts,
      quickEntryReadForm: () => ({}),
      quickEntryLines: () => lines,
      preservePositionForNextRender: () => {},
      render: () => {},
      alert: (m: string) => alerts.push(m),
    });
    vm.runInContext(`${fn(html, 'projectQuickDateValue')}; ${fn(stages, 'quickEntrySetProjectDate')}; quickEntrySetProjectDate(${JSON.stringify(edge)}, ${JSON.stringify(value)});`, context);
    return { lines: lines.map(l => ({ date: l.date, endDate: l.endDate })), alerts };
  };
  assert.deepEqual(run([{ date: '2026-10-28', endDate: '2026-10-28' }], 'start', '2026-10-25').lines, [{ date: '2026-10-25', endDate: '2026-10-28' }]);
  assert.deepEqual(run([{ date: '2026-10-28', endDate: '2026-10-28' }], 'start', '2026-10-30').lines, [{ date: '2026-10-30', endDate: '2026-10-30' }]);
  assert.deepEqual(run([
    { date: '2026-10-20', endDate: '2026-10-21' },
    { date: '2026-10-25', endDate: '2026-10-30' },
  ], 'end', '2026-11-02').lines, [
    { date: '2026-10-20', endDate: '2026-10-21' },
    { date: '2026-10-25', endDate: '2026-11-02' },
  ], 'only the service that ended the project moves');
  assert.deepEqual(run([
    { date: '2026-01-01', endDate: '2026-01-02' },
    { date: '2026-01-05', endDate: '2026-01-20' },
  ], 'start', '2026-01-10').lines, [
    { date: '2026-01-10', endDate: '2026-01-10' },
    { date: '2026-01-10', endDate: '2026-01-20' },
  ], 'a later start moves every service it crosses, so the chosen start stays the project start');
  assert.deepEqual(run([
    { date: '2026-01-01', endDate: '2026-01-12' },
    { date: '2026-01-03', endDate: '2026-01-20' },
  ], 'end', '2026-01-10').lines, [
    { date: '2026-01-01', endDate: '2026-01-10' },
    { date: '2026-01-03', endDate: '2026-01-10' },
  ], 'an earlier end moves every service it crosses');
  const refused = run([{ date: '2026-10-28', endDate: '2026-10-29' }], 'end', '2026-10-20');
  assert.deepEqual(refused.lines, [{ date: '2026-10-28', endDate: '2026-10-29' }]);
  assert.equal(refused.alerts.length, 1);
  const renderer = fn(stages, 'renderQuickEntry');
  assert.match(renderer, /onchange="quickEntrySetProjectDate\('start', this\.value\)"/);
  assert.match(renderer, /onchange="quickEntrySetProjectDate\('end', this\.value\)"/);
  assert.doesNotMatch(renderer, /id="qe-projectStart"[^>]*readonly/);
});

test('«удалить» on a historical draft opens the owner archive flow instead of a missing function', () => {
  const remove = fn(stages, 'quickEntryRemove');
  assert.match(remove, /currentUser\(\)\?\.role !== 'owner'\) return/);
  assert.match(remove, /!o\.quickEntry\) return/);
  assert.match(remove, /openArchiveProjectModal\(o\.id\)/);
  assert.match(html, /function openArchiveProjectModal\(oid\)/);
  assert.match(fn(stages, 'renderQuickEntry'), /onclick="quickEntryRemove\('\$\{o\.id\}'\)">удалить</);
});

test('a new client is one visible button under the name, and similar clients still stop the save', () => {
  const renderer = fn(stages, 'renderQuickEntry');
  assert.match(renderer, /class="qe-client-create" onclick="quickEntryConfirmNewClient\(\)">\+ Создать нового клиента/);
  const create = fn(stages, 'quickEntryFindOrCreateClient');
  assert.match(create, /searchClientsFuzzy\(name\)/);
  assert.match(create, /f\.clientNewConfirmed = true/, 'no similar client: the new card is created without a hidden extra click');
});

test('the owner close first saves the draft on the server, then closes it in a second save, and rolls back if the server refuses', () => {
  const commit = fn(stages, 'quickEntryCommit');
  assert.match(stages, /async function quickEntryCommit\(/);
  assert.match(commit, /if \(quickEntryState\(\)\.committing\) return;/, 'a double click does not create two projects');
  const order = [
    commit.indexOf('save();\n    if (cloud && !await cloudPersistConfirmed())'),
    commit.indexOf('closeQuickProjectAsCompletedWith(o, { requestedPaid: paid, paidDate: lastDate, method'),
    commit.lastIndexOf('if (cloud && !await cloudPersistConfirmed())'),
    commit.indexOf('db.orders[index] = persistedDraft;'),
  ];
  assert.ok(order.every(i => i > 0), 'all four steps are present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'draft save → close → confirmed close save → rollback');
  assert.match(commit, /черновик ещё не сохранён на сервере, проект не закрыт/);
  assert.match(commit, /закрыть проект не удалось/);
  assert.doesNotMatch(commit, /db = cloneCloudWorkspaceValue\(cloudBaseSnapshot\)|db = base;/, 'a refused close never replaces the whole workspace');
  assert.match(commit, /finally \{\n\s*s\.committing = false;/);
  assert.match(fn(html, 'cloudPersistConfirmed'), /if \(cloudSaveInFlight\) \{ cloudSaveQueued = true; return false; \}/, 'a timed-out confirmation keeps the draft save queued');
  assert.match(fn(stages, 'cloudPersist'), /Обновите страницу, чтобы вернуться к сохранённой версии/);
});

test('the server still accepts only the two-step transition: a draft first, then the owner close of a persisted draft', () => {
  const guard = readFileSync('src/features/legacy-crm/service-solutions.ts', 'utf8');
  assert.match(guard, /Новый исторический проект сначала создаётся черновиком; завершить перенос может только владелец\./);
  assert.match(guard, /const historicalImportClosing = owner\s*&& oldOrder\.quickEntry === true && oldOrder\.quickEntryDraft === true/);
});
