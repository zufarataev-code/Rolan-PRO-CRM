import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { linkProjectConversionAttribution } from "./conversion-events";

const input = { legacyOrderId: "project-1", leadId: "lead-1", attributionTouchpointId: "owner-point" };
const deal = (id = "deal-1", extra = {}) => ({ deal_id: id, lead_id: null, attribution_touchpoint_id: null, attribution_touchpoint: null, ...extra });
const sale = (id = "sale-1", extra = {}) => ({ conversion_event_id: id, deal_id: "deal-1", lead_id: null, attribution_touchpoint_id: null, attribution_touchpoint: null, transaction_id: "crm-deal-deal-1-sale", conversion_value: "1234.56", currency: "USD", occurred_at: new Date("2026-10-20T12:00:00Z"), ...extra });
const delivery = (id: string, extra = {}) => ({ conversion_upload_outbox_id: id, conversion_event_id: "sale-1", transaction_id: "crm-deal-deal-1-sale", processing_status: "suppressed", last_error: { code: "no_usable_identifiers" }, submitted_at: null, request_id: null, attempts: 2, next_retry_at: new Date("2026-10-20T12:00:00Z"), ...extra });

function database(deals: any[], events: any[], outboxes: any[]) {
  const updateLinks = (rows: any[], key: string, { where, data }: any) => {
    assert.ok(Object.keys(data).every(field => ["lead_id", "attribution_touchpoint_id"].includes(field)), "business outcome fields are immutable");
    const row = rows.find(item => item[key] === where[key] && item.lead_id === where.lead_id && item.attribution_touchpoint_id === where.attribution_touchpoint_id);
    if (row) Object.assign(row, data);
    return { count: row ? 1 : 0 };
  };
  return {
    deal: {
      findMany: async ({ where }: any) => { assert.deepEqual(where, { legacy_order_id: "project-1" }); return deals; },
      updateMany: async (args: any) => updateLinks(deals, "deal_id", args),
    },
    conversionEvent: {
      findMany: async ({ where }: any) => {
        assert.deepEqual(where.event_type.in, ["qualified_lead", "converted_lead"]);
        assert.deepEqual(where.OR, [{ deal: { legacy_order_id: "project-1" } }, { business_object_type: "legacy_order", business_object_id: "project-1" }, { deal_id: null, business_object_type: "lead", business_object_id: "lead-1", lead_id: "lead-1" }]);
        return events.map(event => ({ ...event, deal: deals.find(item => item.deal_id === event.deal_id) ?? null }));
      },
      updateMany: async (args: any) => updateLinks(events, "conversion_event_id", args),
    },
    conversionUploadOutbox: {
      updateMany: async ({ where, data }: any) => {
        assert.deepEqual({ ...where, conversion_event_id: undefined }, { conversion_event_id: undefined, processing_status: "suppressed", submitted_at: null, request_id: null, last_error: { path: ["code"], equals: "no_usable_identifiers" } });
        assert.deepEqual(Object.keys(data).sort(), ["last_error", "next_retry_at", "processing_status"]);
        for (const row of outboxes) {
          if (where.conversion_event_id.in.includes(row.conversion_event_id) && row.processing_status === where.processing_status && row.submitted_at === null && row.request_id === null && row.last_error?.code === where.last_error.equals) Object.assign(row, data);
        }
        return { count: 1 };
      },
    },
  };
}

test("late owner attribution links the existing online sale and retries only never-submitted identifier suppression", async () => {
  const deals = [deal()], events = [sale()];
  const immutable = { ...events[0] };
  const outboxes = [delivery("missing"), delivery("confirmed", { processing_status: "confirmed" }), delivery("submitted", { processing_status: "submitted", request_id: "google-request" }), delivery("operator", { last_error: { code: "permission_denied" } }), delivery("old-click", { last_error: { code: "click_too_old" } }), delivery("prior-request", { request_id: "prior-request" }), delivery("prior-submit", { submitted_at: new Date() }), delivery("other-project", { conversion_event_id: "other-sale" })];
  const untouched = structuredClone(outboxes.slice(1));
  await linkProjectConversionAttribution(database(deals, events, outboxes) as any, input);
  assert.equal(deals[0].lead_id, "lead-1");
  assert.equal(deals[0].attribution_touchpoint_id, "owner-point");
  assert.deepEqual(events, [{ ...immutable, lead_id: "lead-1", attribution_touchpoint_id: "owner-point" }]);
  assert.equal(outboxes[0].processing_status, "queued");
  assert.equal(outboxes[0].last_error, Prisma.JsonNull);
  assert.ok(outboxes[0].next_retry_at instanceof Date);
  assert.equal(outboxes[0].attempts, 2);
  assert.equal(outboxes[0].transaction_id, immutable.transaction_id);
  assert.deepEqual(outboxes.slice(1), untouched);
  await linkProjectConversionAttribution(database(deals, events, outboxes) as any, input);
  assert.equal(events.length, 1, "binding twice never creates another sale");
  assert.equal(outboxes[0].processing_status, "queued");
});

test("original lead and acquisition evidence survive; a missing event link inherits its Deal's original acquisition", async () => {
  const original = { lead_id: "lead-1", attribution_touchpoint_id: "original-point", attribution_touchpoint: { lead_id: "lead-1" } };
  const deals = [deal("deal-1", original), deal("conflicting-deal", { lead_id: "other-lead" })];
  const events = [sale(), sale("original-event", original), sale("other-lead-event", { lead_id: "other-lead" }), sale("other-point-event", { attribution_touchpoint_id: "other-point", attribution_touchpoint: { lead_id: "other-lead" } }), sale("other-deal-event", { deal_id: "conflicting-deal" })];
  const preserved = structuredClone([deals[1], ...events.slice(1)]);
  const outboxes = events.map(event => delivery(event.conversion_event_id, { conversion_event_id: event.conversion_event_id }));
  await linkProjectConversionAttribution(database(deals, events, outboxes) as any, input);
  assert.equal(events[0].attribution_touchpoint_id, "original-point");
  assert.deepEqual([deals[1], ...events.slice(1)], preserved);
  assert.deepEqual(outboxes.map(row => row.processing_status), ["queued", "queued", "suppressed", "suppressed", "suppressed"]);
  assert.equal(deals[0].attribution_touchpoint_id, "original-point");
});

test("a project-only outcome is linked without creating a Deal, and binding an unsold project creates no event", async () => {
  const events = [sale("legacy-sale", { deal_id: null, business_object_type: "legacy_order", business_object_id: "project-1" })];
  await linkProjectConversionAttribution(database([], events, []) as any, input);
  assert.equal(events[0].attribution_touchpoint_id, "owner-point");
  assert.equal(events[0].lead_id, "lead-1");
  await linkProjectConversionAttribution(database([], [], []) as any, input);
});
