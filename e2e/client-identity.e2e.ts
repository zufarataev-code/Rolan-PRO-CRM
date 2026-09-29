/**
 * End-to-end gate: one customer, one client card.
 *
 * The same person typed twice with a differently formatted phone or email must
 * resolve to the existing client, both through the API and through a legacy
 * workspace save. Runs against a live server + real database (see ci.yml).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { assertSafeE2eTarget } from "./guard";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? "ChangeMe123!";
const MANAGER_EMAIL = "manager@rolanpro.local";

assertSafeE2eTarget(BASE_URL);

const prisma = new PrismaClient();
const runTag = `E2E-CLIENT-${Date.now()}`;
const lastDigits = String(Date.now()).slice(-7);
const phoneAsTyped = `(805) ${lastDigits.slice(0, 3)}-${lastDigits.slice(3)}`;
const phoneOtherFormat = `+1 805-${lastDigits.slice(0, 3)}-${lastDigits.slice(3)}`;

let cookie = "";

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, json, data: (json.data ?? {}) as Record<string, unknown> };
}

before(async () => {
  await prisma.user.updateMany({ where: { email: MANAGER_EMAIL }, data: { must_change_password: false } });
  const login = await call("POST", "/api/v1/auth/login", { email: MANAGER_EMAIL, password: SEED_PASSWORD });
  assert.equal(login.status, 200, `login: ${JSON.stringify(login.json)}`);
});

after(async () => {
  await prisma.$disconnect();
});

test("the same phone in another format reuses the existing client", async () => {
  const first = await call("POST", "/api/v1/clients", { name: `${runTag} Hillside`, phone: phoneAsTyped });
  assert.equal(first.status, 200, `first: ${JSON.stringify(first.json)}`);
  assert.equal(first.data.reused, false);

  const second = await call("POST", "/api/v1/clients", { name: `${runTag} Hillside again`, phone: phoneOtherFormat });
  assert.equal(second.status, 200, `second: ${JSON.stringify(second.json)}`);
  assert.equal(second.data.reused, true, "second create returns the existing card");
  assert.equal(second.data.client_id, first.data.client_id);

  const sameEmail = await call("POST", "/api/v1/clients", {
    name: `${runTag} by email`,
    email: `  ${runTag}@Example.COM `,
  });
  const sameEmailAgain = await call("POST", "/api/v1/clients", {
    name: `${runTag} by email again`,
    email: `${runTag.toLowerCase()}@example.com`,
  });
  assert.equal(sameEmailAgain.data.client_id, sameEmail.data.client_id, "email match is case/space insensitive");

  const cards = await prisma.client.count({ where: { name: { startsWith: runTag } } });
  assert.equal(cards, 2, "one card per real customer");
});

test("a legacy workspace save cannot add a second card for an existing phone", async () => {
  const state = await call("GET", "/api/v1/legacy-crm/state");
  assert.equal(state.status, 200);
  const { payload, revision } = state.data as { payload: { clients?: unknown[] }; revision: number };
  const clients = Array.isArray(payload.clients) ? payload.clients : [];

  const first = { id: `c_${runTag}_1`, name: `${runTag} legacy`, phone: phoneAsTyped, email: "" };
  const saved = await call("PUT", "/api/v1/legacy-crm/state", {
    payload: { ...payload, clients: [...clients, first] },
    revision,
  });
  assert.equal(saved.status, 200, `legacy first: ${JSON.stringify(saved.json)}`);

  const duplicate = { id: `c_${runTag}_2`, name: `${runTag} legacy dup`, phone: phoneOtherFormat, email: "" };
  const rejected = await call("PUT", "/api/v1/legacy-crm/state", {
    payload: { ...payload, clients: [...clients, first, duplicate] },
    revision: (saved.data as { revision: number }).revision,
  });
  assert.equal(rejected.status, 409, `duplicate must be rejected: ${JSON.stringify(rejected.json)}`);
  const errors = rejected.json.errors as Array<{ code: string }>;
  assert.equal(errors?.[0]?.code, "duplicate_client");
});
