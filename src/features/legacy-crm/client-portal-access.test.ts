import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("client account access is explicit, tokenized, renewable and revocable", () => {
  assert.match(html, /function issueClientPortalAccess\(clientId, rotate = false\)/);
  assert.match(html, /function revokeClientPortalAccess\(clientId\)/);
  assert.match(html, /#\/account\/[^`]+encodeURIComponent\(access\.token\)/);
  assert.match(html, /access\.token !== state\.clientAccountPortalToken/);
  assert.match(html, /Доступ к кабинету закрыт/);
  assert.match(html, /Перевыпустить ссылку/);
  assert.match(html, /Отозвать доступ/);
  assert.doesNotMatch(html, /location\.hash='#\/account\/\$\{c\.id\}'/);
});

test("the portal exposes customer-safe chronology, not internal economics", () => {
  assert.match(html, /function clientPortalHistory\(orders = \[\]\)/);
  assert.match(html, /Коммерческое предложение отправлено/);
  assert.match(html, /Оплата получена/);
  assert.match(html, /<h2 class="text-xl font-black">Хронология<\/h2>/);
  const start = html.indexOf("function renderClientAccountPortal()");
  const end = html.indexOf("function togglePortalNewAddressFields", start);
  const portal = html.slice(start, end);
  assert.doesNotMatch(portal, /materialCost|installerCost|profit|margin|payroll|себестоим|марж/i);
});
