import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-11-06: «у каждого сотрудника должна быть форма — телефонный номер
// в карточке, на него он будет получать уведомления; сейчас этого нет».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const fn = (name: string) => { const a = html.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return html.slice(a, html.indexOf('\n}\n', a) + 3); };

test('the team card has the phone and an SMS-notifications switch that is saved', () => {
  assert.match(html, /<input id="tm-edit-phone" value="\$\{academyEsc\(u\.phone \|\| ''\)\}"/);
  assert.match(html, /<input type="checkbox" id="tm-edit-sms" style="width:auto" \$\{u\.notifySms === false \? '' : 'checked'\}> SMS-уведомления на этот номер/);
  assert.match(html, /u\.phone = phone;\n\s*u\.notifySms = document\.getElementById\('tm-edit-sms'\)\?\.checked !== false;/);
});

test('status notifications also go by SMS to every recipient with a phone, without blocking the status change', () => {
  const notify = fn('notifyStatusChange');
  assert.match(notify, /options\.skipSms !== true/);
  assert.match(notify, /filter\(u => u && u\.phone && u\.notifySms !== false && u\.id !== currentUser\(\)\?\.id\)/, 'opted-out staff and the actor are skipped');
  assert.match(notify, /sendSmsViaTwilio\(u\.phone, smsBody, \{ orderId: order\.id, clientId: order\.clientId \|\| null \}\)/);
  assert.match(notify, /Promise\.allSettled\(/, 'SMS delivery runs in the background');
  assert.match(notify, /key: failed\.length && !sent\.length \? 'sms_staff_failed' : 'sms_staff_sent'/);
  assert.ok(notify.indexOf('options.skipSms') < notify.indexOf('if (!deliveries.length) return'), 'the SMS pass does not depend on Telegram being configured');
});
