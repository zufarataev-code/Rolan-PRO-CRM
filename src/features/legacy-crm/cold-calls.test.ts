import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const html = readFileSync(
  join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("cold outreach is a first-class manager workspace", () => {
  assert.match(html, /\['coldcalls', 'Холодные звонки', '📞'\]/);
  assert.match(html, /case 'coldcalls': return renderColdCallsView\(\)/);
  assert.match(html, /function renderColdCallsView\(\)/);
});

test("cold companies remain separate from real clients until conversion", () => {
  assert.match(html, /if \(!Array\.isArray\(db\.coldProspects\)\) db\.coldProspects = \[\]/);
  assert.match(html, /function coldConvertToB2B\(id, openOrderAfter = false\)/);
  assert.match(html, /accountType:'b2b', relationshipType:'regular'/);
  assert.match(html, /source:'cold_call'/);
});

test("call outcomes create follow-up tasks and respect do-not-call", () => {
  assert.match(html, /if \(p\.doNotCall \|\| p\.status === 'do_not_call'\)/);
  assert.match(html, /p\.doNotCall = status === 'do_not_call'/);
  assert.match(html, /if \(\['callback','thinking'\]\.includes\(status\) && !nextRaw\)/);
  assert.match(html, /prospectId:p\.id[\s\S]*?title:`Перезвонить:/);
});

test("converted prospect links to order, proposal and invoice workflow", () => {
  assert.match(html, /Компания → звонок → интерес → B2B-клиент → объект и замер → КП → согласование → счёт/);
  assert.match(html, /state\.pendingColdProspectId = p\.id/);
  assert.match(html, /prospect\.orderId = o\.id/);
  assert.match(html, /openProfessionalKP\('\$\{order\.id\}'\)/);
});
