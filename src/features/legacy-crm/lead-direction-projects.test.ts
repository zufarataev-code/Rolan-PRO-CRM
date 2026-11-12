import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function directionDetector() {
  const rules = legacyCrm.match(/const LEAD_DIRECTION_RULES = \[[\s\S]*?\n\];/)?.[0];
  const fn = legacyCrm.match(/function leadServiceDirectionId[\s\S]*?\n}/)?.[0];
  assert.ok(rules && fn, "direction detector present");
  const services = ["smart_film", "solar_film", "protective_film", "decorative_film", "privacy_film"].map((id) => ({ id }));
  return new Function("ORDER_PRIMARY_SERVICES", `${rules}\n${fn}\nreturn leadServiceDirectionId;`)(services) as (
    lead: { notes?: string; message?: string },
  ) => string;
}

test("ad lead service answer becomes the project direction", () => {
  const detect = directionDetector();
  const meta = "Meta instant form quote request\nwhich_window_film_service_are_you_considering?: Solar / heat control film\nCampaign: RP | Leads | Los Angeles County";
  assert.equal(detect({ notes: meta }), "solar_film");
  assert.equal(detect({ notes: "Service: Smart Film\nCity: LA" }), "smart_film");
  assert.equal(detect({ notes: "service: Anti-Graffiti Film" }), "protective_film");
  assert.equal(detect({ notes: "service: Decorative / frosted film" }), "decorative_film");
  assert.equal(detect({ notes: "service: Privacy film" }), "privacy_film");
  // The campaign name must not override an explicit service answer.
  assert.equal(detect({ notes: "service: Security film\nCampaign: Solar | LA 35-60" }), "protective_film");
  assert.equal(detect({ notes: "Hello, call me please" }), "");
  assert.equal(detect({}), "");
});

test("lead projects carry the direction and wait for the measurer's film choice", () => {
  assert.match(legacyCrm, /\.\.\.\(leadDirection \? orderDirectionFields\(leadDirection\.id/);
  assert.match(legacyCrm, /filmChoicePending: true/);
  assert.match(legacyCrm, /направление: \$\{leadDirection\.title\}, плёнку выберет замерщик/);
});

test("auto projects only for clear, unclaimed ad leads and never on ambiguous clients", () => {
  const auto = legacyCrm.match(/async function autoCreateDirectionProjects[\s\S]*?\n}/)?.[0] || "";
  assert.match(auto, /\['owner', 'manager'\]\.includes\(currentUser\(\)\?\.role\)/);
  assert.match(auto, /lead\.statusCode !== 'NEW_LEAD' \|\| lead\.claimedAt \|\| !lead\.phone/);
  assert.match(auto, /!leadServiceDirectionId\(lead\) \|\| clientsMatchingContact\(lead\.phone, lead\.email\)\.length > 1/);
  assert.match(auto, /convertLeadOnce\(lead\.id, \{ silent: true \}\)/);
  const convert = legacyCrm.match(/async function convertLeadOnce[\s\S]*?\n}/)?.[0] || "";
  assert.match(convert, /if \(silent && matches\.length > 1\) return;/);
  assert.match(convert, /if \(silent\) return;\s*alert\(claim\.message\)/);
  assert.match(legacyCrm, /startCanonicalLeadsPolling\(\);\s*startLeadAutoProjects\(\);/);
});

test("manager can create a project with only a direction — film is chosen on site", () => {
  assert.match(legacyCrm, /data-cashier-direction-only/);
  assert.match(legacyCrm, /Линейку и плёнку выберет замерщик на объекте/);
  const create = legacyCrm.match(/function createOrder\(nextStep = 'project'\)[\s\S]*?\n}/)?.[0] || "";
  assert.match(create, /const directionOnlyId = !selectedOfferings\.length && state\._newOrderDirectionOnly/);
  assert.match(create, /\.\.\.\(offering \? \{ offeringId: offering\.id, offeringName: offering\.name \} : \{ filmChoicePending: true \}\)/);
  assert.match(legacyCrm, /newOrderSelectedOfferings\(\)\.length > 0 \|\| Boolean\(state\._newOrderDirectionOnly\)/);
});
