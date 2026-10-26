import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-26: «замерщик вносит замеры через модуль замера, а менеджер —
// только базовые, чтобы можно было закрыть сделку … более детально на замере,
// и это не должно блокировать КП и назначение монтажа. Смарт: сначала электрик,
// потом монтаж.»
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

function mode(role: string, windows: any[], measureMode: Record<string, string> = {}) {
  const ctx: any = { state: { _measureMode: measureMode }, currentUser: () => ({ role }), orderNeedsMeasurements: () => true, measureAllWindows: () => windows.map(win => ({ win })) };
  vm.createContext(ctx);
  vm.runInContext(fn(stages, 'measureEntryMode'), ctx);
  return vm.runInContext("measureEntryMode({ id: 'o' })", ctx);
}

test('who gets which measurement window', () => {
  assert.equal(mode('manager', []), 'quick');
  assert.equal(mode('manager', [{ id: 'w' }]), 'quick', 'the manager enters only the basic measurement');
  assert.equal(mode('measurer', []), 'full');
  assert.equal(mode('owner', []), 'choose');
  assert.equal(mode('owner', [{ quickMeasure: true }]), 'quick');
  assert.equal(mode('owner', [{ quickMeasure: true }, {}]), 'full');
  assert.equal(mode('owner', [], { o: 'full' }), 'full');
  assert.match(fn(html, 'openManagerMeasureModal'), /if \(mode === 'choose'\) \{ state\.modal = measureChooserHtml\(getOrder\(oid\)\); render\(\); return; \}/);
  assert.match(fn(html, 'openManagerMeasureModal'), /if \(mode === 'quick'\) \{ quickRefresh\(oid\); return; \}/);
});

test('the quick window: rooms, glass sizes, socket and removal per room, Smart questions, what joins the KP', () => {
  const html_ = fn(stages, 'quickMeasureHtml');
  for (const text of ['Розетка рядом с окнами?', 'Снять старую плёнку?', 'Как управляем?', 'Блок питания', 'Стекло', 'Попадёт в КП', 'Стёкол = зон', 'Посчитать → КП', '1 · Электрик', 'не блокирует КП и монтаж']) assert.ok(html_.includes(text), text);
  assert.match(fn(stages, 'quickSetRoomAnswer'), /room\[field\] = yes \? 'yes' : 'no';/);
  const apply = fn(stages, 'quickApplyAnswers');
  assert.match(apply, /system\.electricianNeeded = room\.quickSocket === 'no'/);
  assert.match(apply, /system\.powerBlockNeeded = answers\.block !== 'none'/);
  assert.match(apply, /system\.controlMode = multi \? 'multi' : 'group'/);
  const issues = fn(stages, 'quickMeasureIssues');
  assert.match(issues, /ответьте: как управляем/);
  assert.match(issues, /розетка рядом — да или нет/);
  assert.match(fn(stages, 'quickAddGlassTo'), /win\.quickMeasure = true;/);
});

test('client sizes do not block production or scheduling: one explicit «по размерам клиента»', () => {
  assert.match(fn(html, 'ensureVerifiedMeasurementsForStatus'), /if \(!issues\.length \|\| o\.clientSizesAcceptedAt\) return true;/);
  assert.match(fn(html, 'ensureVerifiedMeasurementsForStatus'), /return projectAcceptClientSizes\(o\.id, 'none'\)/);
  assert.match(fn(html, 'projectProductionReadiness'), /if \(!o\.clientSizesAcceptedAt\) issues\.push\(\.\.\.orderMeasurementVerificationIssues\(o\)\);/);
  assert.match(fn(html, 'openProjectProductionWorkspace'), /Продолжить по размерам клиента/);
  assert.match(fn(stages, 'projectAcceptClientSizes'), /o\.clientSizesAcceptedAt = new Date\(\)\.toISOString\(\);/);
});

test('Smart: the electrician comes first in «Назначить монтаж»', () => {
  const rows = fn(stages, 'installWindowRows');
  assert.match(rows, /const rank = row => \(smart && row\.kind === 'electric' \? 0 : 1\);/);
  const ctx: any = {
    projectPlannedSchedules: () => [], projectServiceProgress: () => ({ status: 'planned' }), installPlanComplete: () => false,
    installWorkKindMeta: (k: string) => ({ label: k }), installWorkKind: (g: any) => g.kind,
    projectServiceGroups: () => [{ id: 'film', kind: 'film' }, { id: 'el', kind: 'electric' }, { id: 'sil', kind: 'silicone' }],
    measureAllWindows: () => [{ win: { measureScope: 'smart_film' } }],
  };
  vm.createContext(ctx);
  vm.runInContext(rows, ctx);
  const order = vm.runInContext('installWindowRows({}).map(r => r.group.id + r.index).join(",")', ctx);
  assert.equal(order, 'el0,film1,sil2');
});

test('renders never call serviceOfferingCanEdit (it alerts the manager)', () => {
  for (const name of ['quickMeasureHtml', 'managerSmartRoomFieldsHtml']) assert.doesNotMatch(fn(stages, name), /serviceOfferingCanEdit\(\)/, name);
});

test('a glass row is size × quantity; the warehouse receives several equal rolls at once', () => {
  assert.match(fn(stages, 'quickMeasureHtml'), /aria-label="Количество стёкол \$\{index \+ 1\}"/);
  assert.match(fn(stages, 'quickSetDim'), /win\.qty = Math\.max\(1, parseInt\(value\) \|\| 1\); win\.actualQty = win\.qty;/);
  assert.match(html, /<label for="ar-count">Количество рулонов \*<\/label>/);
  const confirm = fn(html, 'confirmAddRoll');
  assert.match(confirm, /const count = Math\.max\(1, Math\.min\(50, parseInt\(read\('ar-count'\), 10\) \|\| 1\)\);/);
  assert.match(confirm, /for \(let n = 0; n < count; n \+= 1\) \{/);
  assert.match(confirm, /rollCode = await reserveRollCode\(dateReceived\);/);
});
