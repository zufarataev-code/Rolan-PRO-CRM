import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const legacyCrm = readFileSync(resolve("private/legacy/rolanpro-crm-cloud.html"), "utf8");

test("cloud save status cannot block SMS modal actions", () => {
  const statusStyle = legacyCrm.match(/node\.style\.cssText = '([^']+)'/)?.[1] ?? "";
  assert.match(statusStyle, /pointer-events:none/);
  assert.match(legacyCrm, /id="sms-send-button"/);
});

test("automatic stage updates keep SMS and email bodies separate", () => {
  assert.match(legacyCrm, /kind: 'status',[\s\S]{0,120}smsBody,[\s\S]{0,80}emailBody/);
  assert.match(legacyCrm, /sendSmsViaTwilio\(c\.phone, smsBody/);
  assert.match(legacyCrm, /body:\s*emailBody/);
});

test("automatic client messages require recorded channel consent", () => {
  assert.match(legacyCrm, /c\.smsConsent === true/);
  assert.match(legacyCrm, /c\.emailConsent === true/);
  assert.match(legacyCrm, /нет согласия клиента на SMS/);
});

test("Twilio acceptance is not presented as delivery", () => {
  assert.match(legacyCrm, /Это ещё не подтверждение доставки/);
  assert.doesNotMatch(legacyCrm, /alert\('SMS отправлено'\)/);
});
