/**
 * End-to-end gate: Face ID / Touch ID sign-in (WebAuthn).
 *
 * An employee enables Face ID on a device, signs in with it without a
 * password, keeps that sign-in after changing the password elsewhere, and
 * loses it when the owner switches it off or the employee is deactivated.
 * The device is a software authenticator; the server and database are real
 * (see ci.yml).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { SoftAuthenticator } from "../src/features/auth/testing/soft-authenticator";
import { assertSafeE2eTarget, assertServerUsesTestDatabase } from "./guard";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? "ChangeMe123!";
const OWNER_EMAIL = "owner@rolanpro.local";
const ORIGIN = new URL(BASE_URL).origin;
const RP_ID = new URL(BASE_URL).hostname;

assertSafeE2eTarget(BASE_URL);

const prisma = new PrismaClient();
const runTag = `pk${Date.now()}`;
const employeeEmail = `${runTag}@example.com`;
const employeePassword = `Temp-${runTag}-Aa1`;
const employeeNewPassword = `Next-${runTag}-Bb2`;

type Json = Record<string, unknown>;
type Options = { challenge: string; user: { id: string }; rp: { id: string } };

class Browser {
  cookies = new Map<string, string>();

  async call(method: string, path: string, body?: unknown, origin: string | null = ORIGIN) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    };
    if (origin) headers.origin = origin;
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=");
      const expired = attributes.some((attribute) => /max-age=0/i.test(attribute.trim()));
      if (expired || value === "") this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
    const text = await response.text();
    let json: Json = {};
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: response.status, json };
  }

  async login(email: string, password: string) {
    const response = await this.call("POST", "/api/v1/auth/login", { email, password });
    assert.equal(response.status, 200, `login ${email}: ${JSON.stringify(response.json)}`);
  }
}

const data = <T = Json>(json: Json) => (json.data ?? json) as T;

async function enroll(browser: Browser, device: SoftAuthenticator) {
  const begin = await browser.call("POST", "/api/v1/auth/passkeys/register-options");
  assert.equal(begin.status, 200, `register-options: ${JSON.stringify(begin.json)}`);
  const options = data<{ options: Options }>(begin.json).options;
  return browser.call("POST", "/api/v1/auth/passkeys/register-verify", { response: device.register(options) });
}

async function faceIdLogin(device: SoftAuthenticator, overrides: Parameters<SoftAuthenticator["authenticate"]>[1] = {}) {
  const browser = new Browser();
  const begin = await browser.call("POST", "/api/v1/auth/passkey-login/options");
  assert.equal(begin.status, 200, `login options: ${JSON.stringify(begin.json)}`);
  const options = data<{ options: Options }>(begin.json).options;
  const result = await browser.call("POST", "/api/v1/auth/passkey-login/verify", {
    response: device.authenticate(options, overrides),
  });
  return { browser, result };
}

let owner: Browser;
let employee: Browser;
let employeeId: string;
let passkeyId: string;
const ipad = new SoftAuthenticator(ORIGIN, RP_ID);

before(async () => {
  await assertServerUsesTestDatabase(BASE_URL, prisma);
  await prisma.user.updateMany({ where: { email: OWNER_EMAIL }, data: { must_change_password: false } });
  owner = new Browser();
  await owner.login(OWNER_EMAIL, SEED_PASSWORD);

  const created = await owner.call("POST", "/api/v1/team", {
    email: employeeEmail,
    fullName: `${runTag} Face ID`,
    roles: ["CONSULTANT"],
    password: employeePassword,
  });
  assert.equal(created.status, 200, `create: ${JSON.stringify(created.json)}`);
  employeeId = data<{ userId: string }>(created.json).userId;
});

after(async () => {
  await prisma.$disconnect();
});

test("Face ID cannot be enabled without a session, with a temporary password or from another address", async () => {
  const anonymous = await new Browser().call("POST", "/api/v1/auth/passkeys/register-options");
  assert.equal(anonymous.status, 401);

  employee = new Browser();
  await employee.login(employeeEmail, employeePassword);
  const temporary = await employee.call("POST", "/api/v1/auth/passkeys/register-options");
  assert.equal(temporary.status, 403, "a temporary password must be changed first");

  await prisma.user.update({ where: { user_id: employeeId }, data: { must_change_password: false } });
  const foreign = await employee.call("POST", "/api/v1/auth/passkeys/register-options", undefined, "https://evil.example.com");
  assert.equal(foreign.status, 400);
  const noOrigin = await employee.call("POST", "/api/v1/auth/passkeys/register-options", undefined, null);
  assert.equal(noOrigin.status, 400);
});

test("an employee enables Face ID on a device; the challenge works once", async () => {
  const begin = await employee.call("POST", "/api/v1/auth/passkeys/register-options");
  assert.equal(begin.status, 200, JSON.stringify(begin.json));
  const options = data<{ options: Options }>(begin.json).options;
  assert.equal(options.rp.id, RP_ID);
  const attestation = ipad.register(options);

  const verified = await employee.call("POST", "/api/v1/auth/passkeys/register-verify", {
    response: attestation,
    device_name: "  Мой iPad  ",
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.json));
  passkeyId = data<{ passkey: { passkey_id: string; device_name: string } }>(verified.json).passkey.passkey_id;

  const replay = await employee.call("POST", "/api/v1/auth/passkeys/register-verify", { response: attestation });
  assert.equal(replay.status, 400, "the challenge cookie is cleared after the first verify");

  const stored = await prisma.passkeyCredential.findMany({ where: { user_id: employeeId } });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].credential_id, ipad.id);
  assert.equal(stored[0].device_name, "Мой iPad");
  assert.equal(stored[0].rp_id, RP_ID);

  const list = await employee.call("GET", "/api/v1/auth/passkeys");
  assert.equal(data<{ passkeys: unknown[] }>(list.json).passkeys.length, 1);
});

test("the device signs in with Face ID, no password", async () => {
  const { browser, result } = await faceIdLogin(ipad);
  assert.equal(result.status, 200, JSON.stringify(result.json));
  const user = data<{ user: { user_id: string; roles: string[] } }>(result.json).user;
  assert.equal(user.user_id, employeeId);
  assert.deepEqual(user.roles, ["CONSULTANT"]);

  const me = await browser.call("GET", "/api/v1/auth/me");
  assert.equal(me.status, 200, "the Face ID session is a normal session");

  const stored = await prisma.passkeyCredential.findUniqueOrThrow({ where: { passkey_id: passkeyId } });
  assert.ok(stored.last_used_at, "last use is recorded");
  assert.equal(Number(stored.counter), ipad.signCount);
});

test("changing the password elsewhere ends the old session, and Face ID still signs the device in", async () => {
  const { browser: tablet } = await faceIdLogin(ipad);

  // "On the computer": the employee changes the password in another session.
  const changed = await employee.call("POST", "/api/v1/auth/change-password", { password: employeeNewPassword });
  assert.equal(changed.status, 200, JSON.stringify(changed.json));

  const stale = await tablet.call("GET", "/api/v1/auth/me");
  assert.equal(stale.status, 401, "the tablet's old session is signed out by the password change");

  const { browser: tabletAgain, result } = await faceIdLogin(ipad);
  assert.equal(result.status, 200, "Face ID signs in without typing the new password");
  assert.equal((await tabletAgain.call("GET", "/api/v1/auth/me")).status, 200);
});

test("a challenge is spent on first use even if the browser keeps its cookie", async () => {
  // Sign-in: a captured assertion is sent again together with the original
  // challenge cookie. Without server-side tracking this would mint a session.
  const first = new Browser();
  const begin = await first.call("POST", "/api/v1/auth/passkey-login/options");
  const options = data<{ options: Options }>(begin.json).options;
  const assertion = ipad.authenticate(options, { signCount: 0 });
  const kept = new Map(first.cookies);

  // Counter 0 is what synced passkeys report: the counter check never fires.
  await prisma.passkeyCredential.updateMany({ where: { credential_id: ipad.id }, data: { counter: 0 } });
  const ok = await first.call("POST", "/api/v1/auth/passkey-login/verify", { response: assertion });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));

  const replay = new Browser();
  replay.cookies = new Map(kept);
  const again = await replay.call("POST", "/api/v1/auth/passkey-login/verify", { response: assertion });
  assert.equal(again.status, 400, "the same challenge cannot be verified twice");
  assert.equal(replay.cookies.has(process.env.SESSION_COOKIE_NAME ?? "rolanpro_session"), false);

  // Two copies of the same request at the same moment: exactly one wins.
  const racer = new Browser();
  const raceOptions = data<{ options: Options }>((await racer.call("POST", "/api/v1/auth/passkey-login/options")).json).options;
  const raceAssertion = ipad.authenticate(raceOptions, { signCount: 0 });
  const racers = [new Browser(), new Browser(), new Browser()];
  racers.forEach((browser) => (browser.cookies = new Map(racer.cookies)));
  const results = await Promise.all(
    racers.map((browser) => browser.call("POST", "/api/v1/auth/passkey-login/verify", { response: raceAssertion })),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400, 400]);
  await prisma.passkeyCredential.updateMany({ where: { credential_id: ipad.id }, data: { counter: ipad.signCount } });

  // Enabling: the same attestation with the kept cookie is refused as well.
  const session = new Browser();
  await session.login(employeeEmail, employeeNewPassword);
  const registerOptions = data<{ options: Options }>(
    (await session.call("POST", "/api/v1/auth/passkeys/register-options")).json,
  ).options;
  const spare = new SoftAuthenticator(ORIGIN, RP_ID);
  const attestation = spare.register(registerOptions);
  const keptRegister = new Map(session.cookies);
  assert.equal((await session.call("POST", "/api/v1/auth/passkeys/register-verify", { response: attestation })).status, 200);
  session.cookies = new Map(keptRegister);
  const registerAgain = await session.call("POST", "/api/v1/auth/passkeys/register-verify", { response: attestation });
  assert.equal(registerAgain.status, 400);
  const spareRow = await prisma.passkeyCredential.findUniqueOrThrow({ where: { credential_id: spare.id } });
  assert.equal((await session.call("DELETE", `/api/v1/auth/passkeys/${spareRow.passkey_id}`)).status, 200);
});

test("two copies of one key signing at the same moment do not both get in", async () => {
  // A cloned key: two fresh challenges, the same next counter value.
  const next = ipad.signCount + 1;
  const attempts = await Promise.all(
    [0, 1].map(async () => {
      const browser = new Browser();
      const options = data<{ options: Options }>((await browser.call("POST", "/api/v1/auth/passkey-login/options")).json).options;
      return { browser, response: ipad.authenticate(options, { signCount: next }) };
    }),
  );
  const results = await Promise.all(
    attempts.map(({ browser, response }) => browser.call("POST", "/api/v1/auth/passkey-login/verify", { response })),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
  ipad.signCount = next;
});

test("Face ID sign-in is refused for a replayed counter, another address or an unknown key", async () => {
  const replayed = await faceIdLogin(ipad, { signCount: 1 });
  assert.equal(replayed.result.status, 401);
  assert.equal(replayed.browser.cookies.has(process.env.SESSION_COOKIE_NAME ?? "rolanpro_session"), false);

  const phished = await faceIdLogin(ipad, { origin: "https://evil.example.com" });
  assert.equal(phished.result.status, 401);

  const unknown = await faceIdLogin(new SoftAuthenticator(ORIGIN, RP_ID));
  assert.equal(unknown.result.status, 401);

  const browser = new Browser();
  const noChallenge = await browser.call("POST", "/api/v1/auth/passkey-login/verify", {
    response: ipad.authenticate({ challenge: "c29tZS1vdGhlci1jaGFsbGVuZ2U" }),
  });
  assert.equal(noChallenge.status, 400, "no challenge was issued to this browser");
});

test("only the employee or the owner can switch Face ID off", async () => {
  const foreign = await owner.call("DELETE", `/api/v1/auth/passkeys/${passkeyId}`);
  assert.equal(foreign.status, 404, "another user's key id is not found, even for the owner on the personal route");

  const notOwner = await employee.call("DELETE", `/api/v1/team/${employeeId}/passkeys`);
  assert.equal(notOwner.status, 403);

  const revoked = await owner.call("DELETE", `/api/v1/team/${employeeId}/passkeys`);
  assert.equal(revoked.status, 200, JSON.stringify(revoked.json));
  assert.equal(data<{ removed: number }>(revoked.json).removed, 1);

  assert.equal((await faceIdLogin(ipad)).result.status, 401, "a switched-off device no longer signs in");
});

test("a deactivated employee's Face ID stops working", async () => {
  const session = new Browser();
  await session.login(employeeEmail, employeeNewPassword);
  const phone = new SoftAuthenticator(ORIGIN, RP_ID);
  const enrolled = await enroll(session, phone);
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.json));
  assert.equal((await faceIdLogin(phone)).result.status, 200);

  const own = data<{ passkey: { passkey_id: string } }>(enrolled.json).passkey.passkey_id;
  const secondPhone = new SoftAuthenticator(ORIGIN, RP_ID);
  assert.equal((await enroll(session, secondPhone)).status, 200);
  const removed = await session.call("DELETE", `/api/v1/auth/passkeys/${own}`);
  assert.equal(removed.status, 200, "the employee switches off their own device");
  assert.equal((await faceIdLogin(phone)).result.status, 401);
  assert.equal((await faceIdLogin(secondPhone)).result.status, 200);

  const deactivated = await owner.call("PATCH", `/api/v1/team/${employeeId}`, { isActive: false });
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.json));
  assert.equal((await faceIdLogin(secondPhone)).result.status, 401);
});
