/**
 * End-to-end gate: lead → deal → consultation → surveyor measurement.
 *
 * Runs against a live CRM server backed by a real PostgreSQL database that was
 * built from migrations and seeded (see `.github/workflows/ci.yml`, job
 * `clean-build-e2e`). It drives the same HTTP API the product uses, as a real
 * manager and a real surveyor, and checks what each of them is allowed to see.
 *
 *   E2E_ALLOW_WRITES=1 E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 *
 * It creates records, so it refuses to run unless the app and database are
 * local and E2E_ALLOW_WRITES=1 is set (see ./guard.ts).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { assertSafeE2eTarget, assertServerUsesTestDatabase } from "./guard";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.E2E_SEED_PASSWORD ?? "ChangeMe123!";
const MANAGER_EMAIL = "manager@rolanpro.local";
const SURVEYOR_EMAIL = "consultant@rolanpro.local";

assertSafeE2eTarget(BASE_URL);

const prisma = new PrismaClient();
const runTag = `E2E-${Date.now()}`;

type Session = { cookie: string; userId: string };
type Json = Record<string, unknown>;

async function call(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(session ? { cookie: session.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let json: Json = {};
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: response.status, json, headers: response.headers };
}

function data<T = Json>(json: Json): T {
  return (json.data ?? json) as T;
}

async function login(email: string): Promise<Session> {
  const response = await call(null, "POST", "/api/v1/auth/login", { email, password: PASSWORD });
  assert.equal(response.status, 200, `login ${email}: ${JSON.stringify(response.json)}`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, `login ${email}: no session cookie`);
  const cookie = setCookie.split(";")[0];

  const me = await call({ cookie, userId: "" }, "GET", "/api/v1/auth/me");
  assert.equal(me.status, 200, `me ${email}: ${JSON.stringify(me.json)}`);
  const user = (data<{ user?: { user_id?: string } }>(me.json).user ?? {}) as { user_id?: string };
  assert.ok(user.user_id, `me ${email}: no user_id in ${JSON.stringify(me.json)}`);
  return { cookie, userId: user.user_id };
}

let manager: Session;
let surveyor: Session;
let surveyedConsultationId: string | undefined;

before(async () => {
  await assertServerUsesTestDatabase(BASE_URL, prisma);
  // Seeded demo accounts start with a forced password change; the gate tests
  // the sales workflow, not onboarding, so it clears that flag on the test DB.
  await prisma.user.updateMany({
    where: { email: { in: [MANAGER_EMAIL, SURVEYOR_EMAIL] } },
    data: { must_change_password: false },
  });
  manager = await login(MANAGER_EMAIL);
  surveyor = await login(SURVEYOR_EMAIL);
});

after(async () => {
  await prisma.$disconnect();
});

test("a project moves from lead to verified measurement in one system", async () => {
  // 1. Manager captures a lead.
  const lead = await call(manager, "POST", "/api/v1/leads", {
    name: `${runTag} Hillside Residence`,
    phone: "+1 805 555 0100",
    email: `${runTag.toLowerCase()}@example.com`,
    source: "google_ads",
  });
  assert.equal(lead.status, 200, `create lead: ${JSON.stringify(lead.json)}`);
  const leadId = data<{ lead_id: string }>(lead.json).lead_id;
  assert.ok(leadId);

  // 2. Manager opens a deal for that lead.
  const deal = await call(manager, "POST", "/api/v1/deals", {
    title: `${runTag} Smart + safety film`,
    lead_id: leadId,
    estimated_value: 12000,
  });
  assert.equal(deal.status, 200, `create deal: ${JSON.stringify(deal.json)}`);
  const dealId = data<{ deal_id: string }>(deal.json).deal_id;
  assert.ok(dealId);

  // 3. Manager books a site survey for the surveyor.
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  const consultation = await call(manager, "POST", "/api/v1/consultations", {
    title: `${runTag} Site survey`,
    assigned_consultant_id: surveyor.userId,
    lead_id: leadId,
    deal_id: dealId,
    location_address: "1 Test Way, Westlake Village, CA",
    scheduled_start_at: start.toISOString(),
    scheduled_end_at: new Date(start.getTime() + 3600 * 1000).toISOString(),
  });
  assert.equal(consultation.status, 200, `create consultation: ${JSON.stringify(consultation.json)}`);
  const consultationId = data<{ consultation_id: string }>(consultation.json).consultation_id;
  assert.ok(consultationId);
  surveyedConsultationId = consultationId;

  // 4. Surveyor records two windows; the server computes square footage.
  const windows = [
    { room_name: "Living room", window_id: "W1", width: 72, height: 96, quantity: 2 },
    { room_name: "Office", window_id: "W2", width: 48, height: 60, quantity: 1 },
  ];
  for (const window of windows) {
    const added = await call(surveyor, "POST", `/api/v1/consultations/${consultationId}/measurements`, window);
    assert.equal(added.status, 200, `add measurement ${window.window_id}: ${JSON.stringify(added.json)}`);
  }

  // 5. Manager sees exactly the surveyor's measurements with server-computed area.
  const managerView = await call(manager, "GET", `/api/v1/consultations/${consultationId}`);
  assert.equal(managerView.status, 200, `manager view: ${JSON.stringify(managerView.json)}`);
  const body = JSON.stringify(managerView.json);
  const measurements = findMeasurements(managerView.json);
  assert.equal(measurements.length, 2, `expected 2 measurements, got ${measurements.length}: ${body.slice(0, 600)}`);
  const byWindow = Object.fromEntries(measurements.map((m) => [m.window_id, m]));
  assert.equal(Number(byWindow.W1.sqft), 48, "W1: 72×96 in = 48 sq ft, computed by the server");
  assert.equal(Number(byWindow.W1.quantity), 2);
  assert.equal(Number(byWindow.W2.sqft), 20, "W2: 48×60 in = 20 sq ft, computed by the server");

  // 6. One customer record: the lead was not duplicated along the way.
  const leadsWithTag = await prisma.lead.count({ where: { name: { startsWith: runTag } } });
  assert.equal(leadsWithTag, 1, "exactly one lead for this customer");
  const dealsForLead = await prisma.deal.count({ where: { lead_id: leadId } });
  assert.equal(dealsForLead, 1, "exactly one deal for this lead");
});

test("the surveyor cannot create sales records and sees no financial data", async () => {
  const denied = await call(surveyor, "POST", "/api/v1/leads", { name: `${runTag} should be rejected` });
  assert.ok([401, 403].includes(denied.status), `surveyor created a lead: ${denied.status}`);

  assert.ok(surveyedConsultationId, "the lifecycle test must run first");
  const views = {
    list: await call(surveyor, "GET", "/api/v1/consultations"),
    detail: await call(surveyor, "GET", `/api/v1/consultations/${surveyedConsultationId}`),
  };
  for (const [name, view] of Object.entries(views)) {
    assert.equal(view.status, 200, `surveyor ${name}: ${JSON.stringify(view.json)}`);
    const leaked = findFinancialKeys(view.json);
    assert.deepEqual(leaked, [], `surveyor ${name} exposes financial fields: ${leaked.join(", ")}`);
  }

  // The manager still sees the deal value on the same record.
  const managerDetail = await call(manager, "GET", `/api/v1/consultations/${surveyedConsultationId}`);
  assert.ok(findFinancialKeys(managerDetail.json).includes("estimated_value"), "manager must see the deal value");
});

// Field roles must never receive selling prices, deal values, costs or margins.
const FINANCIAL_KEY = /^(estimated_value|currency|price|unit_price|.*_price|total|.*_total|amount|.*_amount|cost|.*_cost|margin|.*_margin|profit|commission|payout)$/;

function findFinancialKeys(json: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (FINANCIAL_KEY.test(key) && child !== null && child !== undefined) found.add(key);
        visit(child);
      }
    }
  };
  visit(json);
  return [...found].sort();
}

function findMeasurements(json: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.measurements)) {
        for (const item of record.measurements) {
          if (item && typeof item === "object") found.push(item as Record<string, unknown>);
        }
        return;
      }
      Object.values(record).forEach(visit);
    }
  };
  visit(json);
  return found;
}
