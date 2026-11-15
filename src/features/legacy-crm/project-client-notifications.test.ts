import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const fn = (source: string, name: string) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
};

test('new project offers a per-project automatic-notification mute and stores it', () => {
  const modal = html.slice(html.indexOf('function openOrderModal()'), html.indexOf('function offeringServiceType('));
  const creation = html.slice(html.indexOf('function createOrder(nextStep'), html.indexOf('function openClientModal()'));

  assert.match(modal, /id="no-client-notifications-muted"/);
  assert.match(modal, /Не уведомлять клиента автоматически/);
  assert.match(modal, /ручная отправка менеджером остаётся доступной/);
  assert.match(creation, /const clientNotificationsMuted = Boolean\(document\.getElementById\('no-client-notifications-muted'\)\?\.checked\);/);
  assert.match(creation, /clientNotificationsMuted,/);
  assert.match(creation, /key: 'client_notifications_muted'/);
});

test('missing flag keeps current projects enabled; import and project mute block automation', () => {
  const context: any = vm.createContext({ crmImportMode: () => false });
  vm.runInContext(`${fn(html, 'projectClientAutoNotificationsMuted')}; ${fn(html, 'projectClientAutoNotificationsAllowed')}`, context);

  assert.equal(context.projectClientAutoNotificationsAllowed({ id: 'old-project' }), true);
  assert.equal(context.projectClientAutoNotificationsAllowed({ id: 'muted', clientNotificationsMuted: true }), false);
  assert.equal(context.projectClientAutoNotificationsAllowed(null), false);

  context.crmImportMode = () => true;
  assert.equal(context.projectClientAutoNotificationsAllowed({ id: 'import' }), false);
});

test('all background customer paths use the same project guard', () => {
  const scheduler = fn(html, 'runFollowUpScheduler');
  assert.match(scheduler, /if \(!projectClientAutoNotificationsAllowed\(o\)\) continue;/);
  assert.match(scheduler, /const resumedAt = Date\.parse\(o\.clientNotificationsEnabledAt \|\| ''\);/);
  assert.match(scheduler, /if \(Number\.isFinite\(resumedAt\) && dueAt < resumedAt\) continue;/, 'missed follow-ups are not replayed after unmuting');
  assert.match(fn(html, 'autoNotifyClient'), /if \(!projectClientAutoNotificationsAllowed\(o\)\) return;/);
  assert.match(fn(html, 'sendClientOperationalMessage'), /if \(!projectClientAutoNotificationsAllowed\(o\)\) return;/);
  assert.match(fn(html, 'dispatchClientCommunication'), /if \(opts\.manual !== true && !projectClientAutoNotificationsAllowed\(o\)\) return \[\];/);

  const manual = fn(html, 'sendAutomaticClientNotice');
  assert.match(manual, /dispatchClientCommunication[\s\S]*\{ manual: true \}/, 'an explicit manager send remains available');
  assert.doesNotMatch(fn(html, 'notifyStatusChange'), /projectClientAutoNotificationsAllowed/, 'staff notifications are not muted');
});

test('manager can mute and unmute only an accessible project with an audit entry', () => {
  const order: any = { id: 'project', timeline: [] };
  let saves = 0;
  let renders = 0;
  const context: any = vm.createContext({
    getOrder: (id: string) => id === order.id ? order : null,
    currentUser: () => ({ id: 'manager', role: 'manager' }),
    orderUserCanManage: () => true,
    orderUserCanAccess: () => true,
    save: () => { saves += 1; },
    render: () => { renders += 1; },
    Date,
  });
  vm.runInContext(`${fn(html, 'projectClientAutoNotificationsMuted')}; ${fn(html, 'setProjectClientNotificationsMuted')}`, context);

  assert.equal(context.setProjectClientNotificationsMuted('project', true), true);
  assert.equal(order.clientNotificationsMuted, true);
  assert.equal(order.timeline.at(-1).key, 'client_notifications_muted');
  assert.equal(saves, 1);
  assert.equal(renders, 1);

  assert.equal(context.setProjectClientNotificationsMuted('project', false), true);
  assert.equal(order.clientNotificationsMuted, false);
  assert.equal(typeof order.clientNotificationsEnabledAt, 'string');
  assert.equal(order.timeline.at(-1).key, 'client_notifications_enabled');
  assert.equal(saves, 2);

  context.orderUserCanAccess = () => false;
  assert.equal(context.setProjectClientNotificationsMuted('project', true), false);
  assert.equal(order.clientNotificationsMuted, false);
});

test('project card clearly shows notification state without hiding manual channels', () => {
  const control = fn(html, 'renderProjectClientNotificationControl');
  assert.match(control, /Автоматические уведомления клиенту выключены/);
  assert.match(control, /Ручная отправка доступна/);
  assert.match(control, /setProjectClientNotificationsMuted/);
  assert.match(fn(html, 'renderOrderCleanDetails'), /renderProjectClientNotificationControl\(o, canManage\)/);
  assert.match(fn(html, 'renderOrderCommandCenter'), /renderProjectClientNotificationControl\(o, true\)/);
});
