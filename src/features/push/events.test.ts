import assert from "node:assert/strict";
import test from "node:test";

import { deliveryOutcome } from "./dispatcher";
import { legacyPushEvents, MAX_EVENTS_PER_SAVE, newLeadEvents, pgNotificationEvents, stripMoney, textForRecipient, type LegacyPeople } from "./events";

const NOW = Date.UTC(2026, 10, 25, 18);
const TOMORROW = new Date(NOW + 24 * 3600 * 1000).toISOString();
const LAST_WEEK = new Date(NOW - 7 * 24 * 3600 * 1000).toISOString();

const people: LegacyPeople = {
  userIdForLegacy: (id) => ({ mgr: "U-MGR", meas: "U-MEAS", inst1: "U-INST1", inst2: "U-INST2", owner: "U-OWNER" } as Record<string, string>)[id] ?? null,
  ownerUserIds: ["U-OWNER"],
  actorUserId: "U-OWNER",
};

const client = { id: "c1", name: "Иванов", address: "123 Main St" };
const order = (patch: Record<string, unknown> = {}) => ({ id: "o1", number: "R-261125-1", clientId: "c1", managerId: "mgr", status: "new", installerIds: [], ...patch });
const workspace = (...orders: Record<string, unknown>[]) => ({ clients: [client], orders });

test("money never reaches a field employee's lock screen", () => {
  assert.equal(stripMoney("R-1 · $1,500.00 · Иванов"), "R-1 · Иванов");
  assert.equal(stripMoney("Итог 2 079 USD, аванс $500"), "Итог, аванс");
  assert.equal(stripMoney("Монтаж на 1500 долларов завтра"), "Монтаж на завтра");
  const event = { title: "Принят КП на $7,500", body: "R-1 · $7,500 · Иванов" };
  assert.deepEqual(textForRecipient(["INSTALLER"], event), { title: "Принят КП на", body: "R-1 · Иванов" });
  assert.deepEqual(textForRecipient(["CONSULTANT"], event).body, "R-1 · Иванов");
  assert.deepEqual(textForRecipient(["MANAGER"], event), event);
  assert.deepEqual(textForRecipient(["OWNER", "INSTALLER"], event), event);
});

test("a measurer newly put on a project gets one push with the visit, no amounts", () => {
  const before = workspace(order({ total: 7500 }));
  const after = workspace(order({ total: 7500, measurerId: "meas", measurementAt: TOMORROW }));
  const events = legacyPushEvents(before, after, people, NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "assigned_measure");
  assert.equal(events[0].title, "Вам назначен замер");
  assert.deepEqual(events[0].recipients, ["U-MEAS"]);
  assert.match(events[0].body, /^R-261125-1 · Иванов · .+ · 123 Main St$/);
  assert.doesNotMatch(events[0].body, /7500|\$/);
  assert.equal(events[0].url, "/legacy-crm#/order/o1");
  assert.equal(events[0].key, `legacy:measure:o1:meas:${TOMORROW}`);
  // Saving again changes nothing.
  assert.deepEqual(legacyPushEvents(after, after, people, NOW), []);
});

test("only installers added in this save are pushed", () => {
  const before = workspace(order({ installerIds: ["inst1"], installationAt: TOMORROW }));
  const after = workspace(order({ installerIds: ["inst1", "inst2"], installationAt: TOMORROW }));
  const events = legacyPushEvents(before, after, people, NOW);
  assert.deepEqual(events.map((event) => [event.kind, event.recipients]), [["assigned_install", ["U-INST2"]]]);
  assert.equal(events[0].title, "Вам назначен монтаж");
});

test("a new project with a crew pushes each of them", () => {
  const after = workspace(order({ measurerId: "meas", installerIds: ["inst1"] }));
  const kinds = legacyPushEvents(workspace(), after, people, NOW).map((event) => event.kind);
  assert.deepEqual(kinds, ["assigned_measure", "assigned_install"]);
});

test("past visits, closed projects and unknown people are not pushed", () => {
  const before = workspace(order());
  assert.deepEqual(legacyPushEvents(before, workspace(order({ measurerId: "meas", measurementAt: LAST_WEEK })), people, NOW), []);
  assert.deepEqual(legacyPushEvents(before, workspace(order({ status: "completed", installerIds: ["inst1"] })), people, NOW), []);
  assert.deepEqual(legacyPushEvents(before, workspace(order({ status: "cancelled", measurerId: "meas" })), people, NOW), []);
  assert.deepEqual(legacyPushEvents(before, workspace(order({ measurerId: "nobody" })), people, NOW), []);
});

test("nobody is pushed about their own action", () => {
  const self = { ...people, actorUserId: "U-MEAS" };
  assert.deepEqual(legacyPushEvents(workspace(order()), workspace(order({ measurerId: "meas" })), self, NOW), []);
});

test("measurement done goes to the project manager", () => {
  const before = workspace(order({ status: "measurement_scheduled" }));
  const after = workspace(order({ status: "measurement_done", measurementDoneAt: "2026-11-25T17:00:00Z" }));
  const events = legacyPushEvents(before, after, { ...people, actorUserId: "U-MEAS" }, NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "measurement_done");
  assert.deepEqual(events[0].recipients, ["U-MGR"]);
  assert.equal(events[0].body, "R-261125-1 · Иванов · можно готовить КП");
});

test("an accepted proposal goes to the manager and the owners, once", () => {
  const before = workspace(order({ status: "proposal_sent" }));
  const after = workspace(order({ status: "proposal_accepted", proposalAcceptedAt: "2026-11-25T17:00:00Z" }));
  const events = legacyPushEvents(before, after, { ...people, actorUserId: null }, NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "proposal_accepted");
  assert.deepEqual(events[0].recipients.sort(), ["U-MGR", "U-OWNER"]);
  assert.equal(events[0].key, "legacy:accepted:o1");
});

test("an import or mass edit pushes nothing", () => {
  const many = Array.from({ length: MAX_EVENTS_PER_SAVE + 1 }, (_, index) => order({ id: `o${index}`, measurerId: "meas" }));
  assert.deepEqual(legacyPushEvents(workspace(), workspace(...many), people, NOW), []);
  const few = many.slice(0, 3);
  assert.equal(legacyPushEvents(workspace(), workspace(...few), people, NOW).length, 3);
});

test("broken payloads never throw", () => {
  assert.deepEqual(legacyPushEvents(null, undefined, people, NOW), []);
  assert.deepEqual(legacyPushEvents({ orders: "x" }, { orders: [null, 1, { id: "" }] }, people, NOW), []);
});

test("new CRM notifications of the pushed kinds become pushes", () => {
  const rows = [
    { notification_id: "n1", recipient_user_id: "U-INST1", actor_user_id: "U-MGR", type_key: "installation.assigned", title: "Назначен монтаж", message: "Проект R-1", entity_type: "project" },
    { notification_id: "n2", recipient_user_id: "U-MGR", actor_user_id: null, type_key: "agreement.signed", title: "Договор подписан", message: "R-2", entity_type: "proposal" },
    { notification_id: "n3", recipient_user_id: "U-MGR", actor_user_id: "U-MGR", type_key: "survey.completed", title: "x", message: "y", entity_type: null },
    { notification_id: "n4", recipient_user_id: "U-MGR", actor_user_id: null, type_key: "task.overdue", title: "x", message: "y", entity_type: null },
  ];
  const events = pgNotificationEvents(rows, ["U-OWNER"]);
  assert.deepEqual(events.map((event) => [event.key, event.kind, event.recipients]), [
    ["pg:notification:n1", "assigned_install", ["U-INST1"]],
    ["pg:notification:n2", "proposal_accepted", ["U-MGR", "U-OWNER"]],
  ]);
});

test("a new lead goes to the owners and its manager, or every manager when unassigned", () => {
  const events = newLeadEvents([
    { lead_id: "l1", name: "Smith", source: "Google Ads", assigned_manager_id: "U-MGR" },
    { lead_id: "l2", name: "Lee", source: null, assigned_manager_id: null },
  ], ["U-OWNER"], ["U-MGR", "U-MGR2"]);
  assert.deepEqual(events.map((event) => [event.key, event.body, event.recipients]), [
    ["pg:lead:l1", "Smith · Google Ads", ["U-OWNER", "U-MGR"]],
    ["pg:lead:l2", "Lee", ["U-OWNER", "U-MGR", "U-MGR2"]],
  ]);
});

test("a delivery is retried three times, and dropped when every device is gone", () => {
  const ok = { ok: true, status: 201, gone: false };
  const fail = { ok: false, status: 500, gone: false, error: "http_500" };
  const gone = { ok: false, status: 410, gone: true };
  assert.equal(deliveryOutcome([fail, ok], 1).status, "sent");
  assert.deepEqual(deliveryOutcome([fail], 1), { status: "queued", error: "http_500" });
  assert.deepEqual(deliveryOutcome([fail], 3), { status: "failed", error: "http_500" });
  assert.equal(deliveryOutcome([gone], 1).status, "no_device");
  assert.equal(deliveryOutcome([], 1).status, "no_device");
});
