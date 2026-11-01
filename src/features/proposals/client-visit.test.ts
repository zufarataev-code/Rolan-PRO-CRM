import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyVisitChange, nextVisit, publicVisitFromPayload } from "./client-visit-core";

// Owner, 2026-11-01: the client's link led into the staff CRM; the client could
// neither pay nor move a visit. The proposal page now shows the visit and takes
// the request; the CRM link points at that page.
const now = new Date("2026-11-01T12:00:00Z");
const payload = () => ({
  users: [{ id: "u_owner", role: "owner" }, { id: "u_m", role: "manager" }],
  clients: [{ id: "c1", name: "Michael", address: "3201 Hoover St" }],
  orders: [{ id: "o1", number: "R-1", clientId: "c1", managerId: "u_m", status: "installation_scheduled", installationAt: "2026-11-05T16:00:00Z", timeline: [] }],
  notifications: [] as any[],
});

test("the next visit: measurement before the KP, installation after it, never a draft plan", () => {
  assert.equal(nextVisit({ status: "measurement_scheduled", measurementAt: "2026-11-03T16:00:00Z" }, now)?.type, "measure");
  assert.equal(nextVisit({ status: "installation_scheduled", installationAt: "2026-11-05T16:00:00Z" }, now)?.type, "install");
  assert.equal(nextVisit({ status: "proposal_accepted", installationAt: "2026-11-05T16:00:00Z", serviceSchedules: [{ id: "x" }] }, now), null);
  assert.equal(nextVisit({ status: "completed", installationAt: "2026-11-05T16:00:00Z" }, now), null);
  assert.equal(nextVisit({ status: "installation_scheduled", installationAt: "2026-10-01T16:00:00Z" }, now), null, "a past date is not offered");
});

test("a reschedule request lands in the project and notifies the manager and the owner", () => {
  const data = payload();
  const result = applyVisitChange(data, "o1", { action: "reschedule", requestedAt: "2026-11-07T17:00:00Z", reason: "не будем дома" }, now);
  assert.equal(typeof result, "object");
  const order = data.orders[0] as any;
  assert.equal(order.clientRequests.length, 1);
  assert.deepEqual([order.clientRequests[0].type, order.clientRequests[0].eventType, order.clientRequests[0].status], ["reschedule", "install", "new"]);
  assert.equal(order.timeline.at(-1).key, "client_reschedule_requested");
  assert.deepEqual(data.notifications.map(n => n.userId).sort(), ["u_m", "u_owner"]);
  assert.equal(order.installationAt, "2026-11-05T16:00:00Z", "the date changes only when the manager confirms");
  assert.equal(applyVisitChange(data, "o1", { action: "cancel", reason: "ещё раз" }, now), "already_requested");
  assert.equal(publicVisitFromPayload(data, "o1", now)?.pending?.type, "reschedule");
});

test("bad requests are refused", () => {
  assert.equal(applyVisitChange(payload(), "o1", { action: "reschedule", requestedAt: "2026-10-01T10:00:00Z", reason: "ok" }, now), "invalid_time");
  assert.equal(applyVisitChange(payload(), "o1", { action: "cancel", reason: " " }, now), "invalid_reason");
  assert.equal(applyVisitChange(payload(), "nope", { action: "cancel", reason: "ok" }, now), "not_found");
});

test("client links open the proposal page, not the staff CRM", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const start = html.indexOf("function clientPortalUrl(orderId) {");
  const fn = html.slice(start, html.indexOf("\n}\n", start));
  assert.match(fn, /getPremiumProposalByOrder\(orderId\)/);
  assert.match(fn, /premiumProposalUrl\(proposal\)/);
  assert.doesNotMatch(fn, /#\/client\//);
  const pkg = readFileSync("src/components/public-proposal-package.tsx", "utf8");
  assert.match(pkg, /<PublicVisitCard accessToken=\{accessToken\} language=\{language\} \/>/);
});
