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
  assert.doesNotMatch(fn(stages, 'managerSmartRoomFieldsHtml'), /serviceOfferingCanEdit\(\)/);
});

test('the warehouse receives several equal rolls at once', () => {
  assert.match(html, /<label for="ar-count">Количество рулонов \*<\/label>/);
  const confirm = fn(html, 'confirmAddRoll');
  assert.match(confirm, /const count = Math\.max\(1, Math\.min\(50, parseInt\(read\('ar-count'\), 10\) \|\| 1\)\);/);
  assert.match(confirm, /for \(let n = 0; n < count; n \+= 1\) \{/);
  assert.match(confirm, /rollCode = await reserveRollCode\(dateReceived\);/);
});

test('one measurement window: no separate quick window; each person picks the extra fields', () => {
  assert.doesNotMatch(stages, /function quickMeasureHtml\(|function measureEntryMode\(/);
  assert.doesNotMatch(fn(html, 'openManagerMeasureModal'), /quickRefresh|measureChooserHtml/);
  const bar = fn(stages, 'measureFieldsBarHtml');
  assert.match(bar, /✓ Размеры и количество/);
  for (const label of ['Направление плёнки', 'Стекло и доступ', 'Примечания и фото', 'Smart: зона и подключение']) assert.ok(fn(stages, 'measureFieldGroups').includes(label), label);
  assert.match(fn(stages, 'measureFieldPrefs'), /currentUser\(\)\?\.role === 'measurer' \? measureFieldGroups\(\)\.map/);
  assert.match(html, /\.mm-hide-tech \.manager-window-technical/);
  assert.match(html, /manager-measure-modal \$\{typeof measureHiddenClasses === 'function' \? measureHiddenClasses\(\) : ''\}/);
});

test('import mode: old projects go to any stage without checks or client messages', () => {
  const cs = fn(html, 'changeStatus');
  assert.match(cs, /if \(importing\) opts = \{ \.\.\.opts, skipWorkflowGuard: true, skipPaymentGuard: true, skipScheduleGuard: true, skipClientAuto: true, importing: true \};/);
  assert.match(cs, /if \(!opts\.importing && \(entersInstallation \|\| closesInstallation\) && !ensureProjectServicesPlanned/);
  assert.match(cs, /if \(!opts\.importing && !ensureVerifiedMeasurementsForStatus/);
  assert.match(cs, /if \(!opts\.importing && \(closesInstallation \|\| newStatus === 'installation_done'\)/, 'no stock deduction for old projects');
  assert.match(fn(html, 'notifyClientEventScheduled'), /crmImportMode\(\)\) return;/);
  assert.match(fn(html, 'autoNotifyClient'), /crmImportMode\(\)\) return;/);
  assert.match(fn(html, 'projectEstimateReadiness'), /crmImportMode\(\)\) return \[\];/);
  assert.match(fn(stages, 'setCrmImportMode'), /if \(currentUser\(\)\?\.role !== 'owner'\) return;/);
  assert.match(html, /key: 'import-mode', icon: '🗂', title: 'Режим внедрения'/);
});
