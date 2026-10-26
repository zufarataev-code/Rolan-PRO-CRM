import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  activeAppointmentForOrder,
  createPublicAppointmentToken,
  readPublicAppointmentToken,
} from "./public-appointments";

test("public appointment tokens are signed, expire and cannot be changed", () => {
  const now = Date.parse("2026-10-25T12:00:00.000Z");
  const token = createPublicAppointmentToken("order-42", now);
  assert.equal(readPublicAppointmentToken(token, now)?.orderId, "order-42");
  assert.equal(readPublicAppointmentToken(`${token.slice(0, -1)}x`, now), null);
  assert.equal(readPublicAppointmentToken(token, now + 366 * 24 * 60 * 60 * 1000), null);
});

test("the public page exposes only the current appointment in the project funnel", () => {
  assert.deepEqual(activeAppointmentForOrder({
    status: "measurement_scheduled",
    consultationAt: "2026-10-24T16:00:00.000Z",
    measurementAt: "2026-10-27T16:00:00.000Z",
    installationAt: "2026-11-04T16:00:00.000Z",
  }), {
    eventType: "measure",
    title: "Замер",
    field: "measurementAt",
    scheduledAt: "2026-10-27T16:00:00.000Z",
  });
});

test("legacy schedule notices use the signed public appointment route", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const start = html.indexOf("function clientAppointmentUrl(orderId)");
  const end = html.indexOf("// ---------- ORDER OPERATING EVENTS", start);
  const linkCode = html.slice(start, end);
  assert.match(linkCode, /\/appointment\/\$\{encodeURIComponent\(order\.clientAppointmentToken\)\}/);
  assert.match(linkCode, /\/api\/v1\/legacy-crm\/appointment-link/);
  assert.doesNotMatch(linkCode, /publicBaseUrl|#\/client\//);
  assert.match(html, /const appointmentUrl = await ensureClientAppointmentUrl\(orderId\)/);
  assert.match(html, /ответьте на это сообщение менеджеру RolanPRO/);
});
