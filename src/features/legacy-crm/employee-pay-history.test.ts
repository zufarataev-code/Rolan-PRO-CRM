import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("manager, surveyor and installer have a personal payroll route", () => {
  assert.match(html, /\['payroll', 'Зарплата', '💰'\]/);
  assert.equal((html.match(/\['payroll', 'Моя зарплата', '💰'\]/g) || []).length, 2);
  assert.match(html, /case 'payroll': return u\.role === 'owner' \? renderPayroll\(\) : renderMyPayroll\(\);/);
  assert.equal((html.match(/case 'payroll': return renderMyPayroll\(\);/g) || []).length, 2);
});

test("personal payroll reuses canonical calculations and never exposes payroll administration", () => {
  const start = html.indexOf("function renderMyPayroll()");
  const end = html.indexOf("function renderPayroll()", start);
  assert.ok(start >= 0 && end > start);
  const personal = html.slice(start, end);

  assert.match(personal, /calcUserPayoutForPeriod\(user\.id, start, end\)/);
  assert.match(personal, /payrollPaidForPeriod\(user\.id, start, end\)/);
  assert.match(personal, /payment\.userId === user\.id/);
  assert.doesNotMatch(personal, /db\.users/);
  assert.doesNotMatch(personal, /markPayoutPaid/);
  assert.doesNotMatch(personal, /orderPSS|orderMargin|materialCost/);
});

test("assigned field orders expose the safe order history", () => {
  assert.match(html, /function renderEmployeeOrderHistory\(order, user = currentUser\(\), limit = 0\)/);
  assert.match(html, /function openEmployeeOrderHistory\(orderId\)[\s\S]*?orderUserCanAccess\(order, user\)/);
  assert.match(html, /function renderInstallerTechnicalWorkspace\(o, c, u\)[\s\S]*?title: 'История заказа'/);
  assert.match(html, /if \(orderUserOwns\(order, user\)\) return items\.filter\(ev => ev\.key !== 'payout_paid'\);/);
});
