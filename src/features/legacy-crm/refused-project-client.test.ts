import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-11-27: «Давай поправь код, чтобы этого больше не было». A change to the
// closed R-261122-165 refused last night stayed on the phone and blocked the new
// measurement of R-261127-179. Now the browser sets aside only the refused project.

const src = readFileSync('private/legacy/production-stages.js', 'utf8');
function fn(name: string) {
  const start = src.search(new RegExp(`(async )?function ${name}\\(`));
  const end = src.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, name);
  return src.slice(start, end + 2);
}

const NAMES = ['cloudPersist', 'projectSetAsideStorageKey', 'projectFindInWorkspace', 'projectSetAsideEntries',
  'projectSetAsideStore', 'projectSetAsideRefused', 'projectSetAsideText', 'projectShowSetAside', 'projectDropSetAside'];

function base() {
  return {
    clients: [{ id: 'c1', name: 'Daniel' }],
    orders: [
      { id: 'closed-import', number: 'R-261122-165', status: 'completed', quickProjectImportedCompleted: true, measurements: { rooms: [] } },
      { id: 'daniel', number: 'R-261127-179', clientId: 'c1', status: 'measurement_scheduled', measurements: { rooms: [] } },
    ],
  };
}

function run(responses: Array<{ status: number; body: unknown }>) {
  const store = new Map<string, string>();
  const sent: any[] = [];
  const statuses: string[] = [];
  const layer: { id: string; innerHTML: string; removed: boolean } = { id: '', innerHTML: '', removed: false };
  const db: any = base();
  db.orders[0].measurements = { rooms: [{ id: 'r', name: 'Office', windows: [] }] }; // stale, refused
  db.orders[1].measurements = { rooms: [{ id: 'b', name: 'Bathroom', windows: [{ id: 'w', name: 'Обычное окно - 2 створки 1', width: 35, height: 60, qty: 2 }] }] };
  const ctx: any = vm.createContext({
    db, cloudBaseSnapshot: base(), cloudRevision: 7, cloudReady: true, cloudSaveInFlight: false, cloudSaveQueued: false,
    JSON, Date, Math, String, Number, Array, Error, console,
    fetch: async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body));
      const next = responses.shift()!;
      return { status: next.status, ok: next.status < 300, json: async () => next.body };
    },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
    document: {
      getElementById: (id: string) => (layer.id === id && !layer.removed ? layer : null),
      createElement: () => { layer.removed = false; return Object.assign(layer, { remove() { layer.removed = true; } }); },
      body: { appendChild: () => {} },
    },
    academyEsc: (v: unknown) => String(v ?? ''),
    getClient: (id: string) => (id === 'c1' ? { name: 'Daniel' } : null),
    cloudCancelRetry: () => {}, cloudStatus: (text: string) => statuses.push(text), render: () => {}, renderBackground: () => {},
    projectClaimServiceFollowUps: () => 0, projectRunClaimedFollowUps: async () => {}, cloudScheduleSave: () => {},
    cloudScheduleRetry: () => {}, alert: () => {}, cloneCloudWorkspaceValue: (v: unknown) => JSON.parse(JSON.stringify(v)),
  });
  vm.runInContext(NAMES.map(fn).join('\n'), ctx);
  return { ctx, sent, statuses, store, layer, result: (responses.length ? vm.runInContext('cloudPersist()', ctx) : Promise.resolve(false)) as Promise<boolean> };
}

test('a stale refused change on project A is set aside and the new measurement on project B saves', async () => {
  const { ctx, sent, statuses, store, layer, result } = run([
    { status: 400, body: { errors: [{ code: 'invalid_service_solution', message: 'R-261122-165: Завершённый исторический проект может исправлять только владелец.' }],
      meta: { refused_project_id: 'closed-import', refused_project_number: 'R-261122-165' } } },
    { status: 200, body: { data: { revision: 8, production_stage_updates: [] } } },
  ]);
  assert.equal(await result, true);
  assert.equal(sent.length, 2);
  const retried = JSON.parse(JSON.stringify(sent[1].payload));
  assert.deepEqual(retried.orders.find((o: any) => o.id === 'closed-import').measurements, { rooms: [] }, 'A goes back to the server copy');
  assert.equal(retried.orders.find((o: any) => o.id === 'daniel').measurements.rooms[0].windows[0].width, 35, 'B keeps the new window');
  assert.equal(ctx.cloudRevision, 8);
  assert.equal(statuses.at(-1), 'Сохранено');

  const kept = JSON.parse(store.get('rolanpro_crm_set_aside')!);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].number, 'R-261122-165');
  assert.deepEqual(kept[0].project.measurements.rooms[0].name, 'Office', 'the refused change is kept on the device');
  assert.match(layer.innerHTML, /НЕ СОХРАНЕНО/);
  assert.match(layer.innerHTML, /R-261122-165/);
  assert.match(layer.innerHTML, />Скопировать</);
  assert.match(layer.innerHTML, />Сбросить</);

  vm.runInContext(`projectDropSetAside(${JSON.stringify(kept[0].key)})`, ctx);
  assert.equal(JSON.parse(store.get('rolanpro_crm_set_aside')!).length, 0);
  assert.equal(layer.removed, true);
});

test('the set-aside text lists rooms, windows and sizes', () => {
  const { ctx } = run([]);
  const text = vm.runInContext(`projectSetAsideText({ number: 'R-261127-179', reason: 'Нет связи', project: db.orders[1] })`, ctx);
  assert.equal(text, 'R-261127-179 — не сохранено\nНет связи\nКлиент: Daniel\n\nBathroom:\n• Обычное окно - 2 створки 1 — 35 × 60 × 2 шт.');
});

test('a refusal without a named project is shown as before and nothing is set aside', async () => {
  const { sent, statuses, store, result } = run([
    { status: 400, body: { errors: [{ code: 'invalid_service_solution', message: 'Только владелец может менять справочник услуг.' }], meta: {} } },
  ]);
  assert.equal(await result, false);
  assert.equal(sent.length, 1);
  assert.match(statuses.at(-1)!, /^Не сохранено: Только владелец может менять справочник услуг\./);
  assert.equal(store.get('rolanpro_crm_set_aside'), undefined);
});

test('the same project refused again with nothing of ours left is not set aside twice', async () => {
  const { sent, result, store } = run([
    { status: 400, body: { errors: [{ message: 'x' }], meta: { refused_project_id: 'closed-import' } } },
    { status: 400, body: { errors: [{ message: 'x' }], meta: { refused_project_id: 'closed-import' } } },
  ]);
  assert.equal(await result, false, 'the second refusal falls back to the red message');
  assert.equal(sent.length, 2);
  assert.equal(JSON.parse(store.get('rolanpro_crm_set_aside')!).length, 1);
});
