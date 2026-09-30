/**
 * End-to-end gate: one employee directory and read-only "view as employee".
 *
 * Owner adds an employee with two roles, changes the roles, the employee signs
 * in and is recognised by the legacy CRM without the owner ever opening it,
 * and the owner can view the CRM as that employee without being able to change
 * anything. Runs against a live server + real database (see ci.yml).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { assertSafeE2eTarget, assertServerUsesTestDatabase } from "./guard";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? "ChangeMe123!";
const OWNER_EMAIL = "owner@rolanpro.local";
const MANAGER_EMAIL = "manager@rolanpro.local";

assertSafeE2eTarget(BASE_URL);

const prisma = new PrismaClient();
const runTag = `e2e${Date.now()}`;
const employeeEmail = `${runTag}@example.com`;
const employeePassword = `Temp-${runTag}-Aa1`;

type Json = Record<string, unknown>;

class Browser {
  cookies = new Map<string, string>();

  async call(method: string, path: string, body?: unknown) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      },
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
    return { status: response.status, json, location: response.headers.get("location") };
  }

  async login(email: string, password: string) {
    const response = await this.call("POST", "/api/v1/auth/login", { email, password });
    assert.equal(response.status, 200, `login ${email}: ${JSON.stringify(response.json)}`);
  }
}

const data = <T = Json>(json: Json) => (json.data ?? json) as T;

let owner: Browser;
let employeeId: string;

before(async () => {
  await assertServerUsesTestDatabase(BASE_URL, prisma);
  await prisma.user.updateMany({
    where: { email: { in: [OWNER_EMAIL, MANAGER_EMAIL] } },
    data: { must_change_password: false },
  });
  owner = new Browser();
  await owner.login(OWNER_EMAIL, SEED_PASSWORD);
});

after(async () => {
  await prisma.$disconnect();
});

test("every script injected into the owner's CRM page compiles", async () => {
  // Injected scripts live in TypeScript template literals, where escapes are
  // easy to lose; one syntax error silently disables the whole patch.
  const response = await fetch(`${BASE_URL}/legacy-crm`, {
    headers: { cookie: [...owner.cookies].map(([name, value]) => `${name}=${value}`).join("; ") },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length > 1);
  scripts.forEach((code, index) => {
    assert.doesNotThrow(() => new Function(code), `inline script #${index} has a syntax error`);
  });
});

test("owner adds an employee with several roles and changes them in one step", async () => {
  const created = await owner.call("POST", "/api/v1/team", {
    email: employeeEmail,
    fullName: `${runTag} Surveyor`,
    roles: ["CONSULTANT", "INSTALLER"],
    password: employeePassword,
  });
  assert.equal(created.status, 200, `create: ${JSON.stringify(created.json)}`);
  employeeId = data<{ userId: string }>(created.json).userId;

  const tooShort = await owner.call("PATCH", `/api/v1/team/${employeeId}`, { password: "short-pass" });
  assert.equal(tooShort.status, 400, "one password rule everywhere: 12+ characters");

  const changed = await owner.call("PATCH", `/api/v1/team/${employeeId}`, { roles: ["CONSULTANT"] });
  assert.equal(changed.status, 200, `change roles: ${JSON.stringify(changed.json)}`);

  const roles = await prisma.userAccess.findMany({
    where: { user_id: employeeId },
    include: { role: { select: { code: true } } },
  });
  assert.deepEqual(roles.map((access) => access.role.code).sort(), ["CONSULTANT"]);
});

test("installation groups: a team lead can be assigned; a non-lead cannot", async () => {
  const installer = await owner.call("POST", "/api/v1/team", {
    email: `inst-${runTag}@example.com`,
    fullName: `${runTag} Installer`,
    roles: ["INSTALLER"],
    password: employeePassword,
  });
  assert.equal(installer.status, 200, `create installer: ${JSON.stringify(installer.json)}`);
  const installerId = data<{ userId: string }>(installer.json).userId;

  const leadWithoutGroup = await owner.call("POST", "/api/v1/team", {
    email: `lead-empty-${runTag}@example.com`,
    fullName: `${runTag} Lead without group`,
    roles: ["INSTALLER", "INSTALLER_LEAD"],
    password: employeePassword,
  });
  assert.equal(leadWithoutGroup.status, 400, "a new lead needs 1–5 installers");

  const lead = await owner.call("POST", "/api/v1/team", {
    email: `lead-${runTag}@example.com`,
    fullName: `${runTag} Lead`,
    roles: ["INSTALLER", "INSTALLER_LEAD"],
    password: employeePassword,
    groupInstallerIds: [installerId],
  });
  assert.equal(lead.status, 200, `create lead: ${JSON.stringify(lead.json)}`);
  const leadId = data<{ userId: string }>(lead.json).userId;
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { user_id: installerId } })).installer_lead_id,
    leadId,
    "the initial group is assigned at creation",
  );

  const emptyGroup = await owner.call("PATCH", `/api/v1/team/${leadId}`, { groupInstallerIds: [] });
  assert.equal(emptyGroup.status, 400, "a lead keeps at least one installer");

  const nonLeadGroup = await owner.call("PATCH", `/api/v1/team/${employeeId}`, { groupInstallerIds: [installerId] });
  assert.equal(nonLeadGroup.status, 400, "only a lead can get a group, even when roles are not sent");

  const assigned = await owner.call("PATCH", `/api/v1/team/${installerId}`, { installerLeadId: leadId });
  assert.equal(assigned.status, 200, `assign lead: ${JSON.stringify(assigned.json)}`);
  const stored = await prisma.user.findUniqueOrThrow({ where: { user_id: installerId } });
  assert.equal(stored.installer_lead_id, leadId);

  const notALead = await owner.call("PATCH", `/api/v1/team/${leadId}`, { installerLeadId: installerId });
  assert.equal(notALead.status, 400, "only an INSTALLER_LEAD can lead a group");

  const notAnInstaller = await owner.call("PATCH", `/api/v1/team/${leadId}`, { groupInstallerIds: [employeeId] });
  assert.equal(notAnInstaller.status, 400, "a surveyor cannot be put into an installation group");

  const group = await owner.call("PATCH", `/api/v1/team/${leadId}`, { groupInstallerIds: [installerId] });
  assert.equal(group.status, 200, `set group: ${JSON.stringify(group.json)}`);
  const tooMany = await owner.call("PATCH", `/api/v1/team/${leadId}`, {
    groupInstallerIds: Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-00000000000${index}`),
  });
  assert.equal(tooMany.status, 400, "a group has at most 5 installers");

  const leadOnly = await owner.call("PATCH", `/api/v1/team/${leadId}`, { roles: ["INSTALLER_LEAD"] });
  assert.equal(leadOnly.status, 400, "a lead must keep the installer role");

  const staleGroup = await owner.call("PATCH", `/api/v1/team/${leadId}`, {
    fullName: `${runTag} Lead renamed`,
    groupInstallerIds: [employeeId],
  });
  assert.equal(staleGroup.status, 400, "invalid group rejects the whole update");
  assert.notEqual(
    (await prisma.user.findUniqueOrThrow({ where: { user_id: leadId } })).full_name,
    `${runTag} Lead renamed`,
    "nothing was written when the group was invalid",
  );

  const disabled = await owner.call("PATCH", `/api/v1/team/${leadId}`, { isActive: false, groupInstallerIds: [installerId] });
  assert.equal(disabled.status, 200, `disable lead: ${JSON.stringify(disabled.json)}`);
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { user_id: installerId } })).installer_lead_id,
    null,
    "a switched-off lead releases the group",
  );
  const reactivated = await owner.call("PATCH", `/api/v1/team/${leadId}`, { isActive: true, groupInstallerIds: [installerId] });
  assert.equal(reactivated.status, 200, `reactivate lead: ${JSON.stringify(reactivated.json)}`);

  const demoted = await owner.call("PATCH", `/api/v1/team/${leadId}`, { roles: ["INSTALLER"] });
  assert.equal(demoted.status, 200);
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { user_id: installerId } })).installer_lead_id,
    null,
    "losing the lead role releases the group",
  );

  const removed = await owner.call("PATCH", `/api/v1/team/${installerId}`, { installerLeadId: null });
  assert.equal(removed.status, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { user_id: installerId } })).installer_lead_id, null);
});

test("a team lead sees group jobs without prices and distributes only within the group", async () => {
  // Group: lead + installer; an outsider installer is not in the group.
  const mk = async (tag: string, roles: string[]) => {
    const created = await owner.call("POST", "/api/v1/team", {
      email: `${tag}-${runTag}@example.com`, fullName: `${runTag} ${tag}`, roles, password: employeePassword,
    });
    assert.equal(created.status, 200, `create ${tag}: ${JSON.stringify(created.json)}`);
    const userId = data<{ userId: string }>(created.json).userId;
    await prisma.user.update({ where: { user_id: userId }, data: { must_change_password: false } });
    return userId;
  };
  const leadId = await mk("glead", ["INSTALLER", "INSTALLER_LEAD"]);
  const memberId = await mk("gmember", ["INSTALLER"]);
  const outsiderId = await mk("gout", ["INSTALLER"]);
  assert.equal((await owner.call("PATCH", `/api/v1/team/${leadId}`, { groupInstallerIds: [memberId] })).status, 200);

  // Legacy card ids are assigned on first read of the workspace.
  const ownerState = await owner.call("GET", "/api/v1/legacy-crm/state");
  const legacyId = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { user_id: userId } })).legacy_user_ids[0];
  const [leadCard, memberCard, outsiderCard] = [await legacyId(leadId), await legacyId(memberId), await legacyId(outsiderId)];
  const { payload, revision } = data<{ payload: { orders?: unknown[] }; revision: number }>(ownerState.json);
  const orderId = `o_${runTag}`;
  const order = { id: orderId, number: runTag, status: "installation_scheduled", installerIds: [memberCard], clientId: "", priceOverridePerSqft: 99, notes: "group job" };
  const put = await owner.call("PUT", "/api/v1/legacy-crm/state", {
    payload: { ...payload, orders: [...((payload.orders as unknown[]) || []), order] },
    revision,
  });
  assert.equal(put.status, 200, `owner adds order: ${JSON.stringify(put.json)}`);

  const lead = new Browser();
  await lead.login(`glead-${runTag}@example.com`, employeePassword);
  const leadState = await lead.call("GET", "/api/v1/legacy-crm/state");
  const leadPayload = data<{ payload: { orders: Array<Record<string, unknown>>; users: Array<Record<string, unknown>> }; revision: number }>(leadState.json);
  const seen = leadPayload.payload.orders.find((item) => item.id === orderId);
  assert.ok(seen, "the lead sees a job assigned to a group member");
  assert.equal(seen.priceOverridePerSqft, undefined, "prices are redacted for the lead");
  assert.ok(leadPayload.payload.users.some((user) => user.id === leadCard && user.installerLead === true));

  // Distribute inside the group: allowed.
  const redistributed = { ...seen, installerIds: [leadCard, memberCard] };
  const ok = await lead.call("PUT", "/api/v1/legacy-crm/state", {
    payload: { ...leadPayload.payload, orders: leadPayload.payload.orders.map((item) => (item.id === orderId ? redistributed : item)) },
    revision: leadPayload.revision,
  });
  assert.equal(ok.status, 200, `lead save: ${JSON.stringify(ok.json)}`);
  const storedAfter = (await prisma.legacyWorkspace.findUniqueOrThrow({ where: { workspace_id: "primary" } })).payload as { orders: Array<Record<string, unknown>> };
  assert.deepEqual(storedAfter.orders.find((item) => item.id === orderId)?.installerIds, [leadCard, memberCard]);

  // Put an outsider on the job: ignored by the server.
  const again = data<{ payload: { orders: Array<Record<string, unknown>> }; revision: number }>((await lead.call("GET", "/api/v1/legacy-crm/state")).json);
  await lead.call("PUT", "/api/v1/legacy-crm/state", {
    payload: { ...again.payload, orders: again.payload.orders.map((item) => (item.id === orderId ? { ...item, installerIds: [outsiderCard] } : item)) },
    revision: again.revision,
  });
  const storedFinal = (await prisma.legacyWorkspace.findUniqueOrThrow({ where: { workspace_id: "primary" } })).payload as { orders: Array<Record<string, unknown>> };
  assert.deepEqual(storedFinal.orders.find((item) => item.id === orderId)?.installerIds, [leadCard, memberCard], "outsider rejected");

  // A manager adds an installer from another group; the lead's redistribution keeps them.
  const ownerNow = data<{ payload: { orders: Array<Record<string, unknown>> }; revision: number }>((await owner.call("GET", "/api/v1/legacy-crm/state")).json);
  await owner.call("PUT", "/api/v1/legacy-crm/state", {
    payload: { ...ownerNow.payload, orders: ownerNow.payload.orders.map((item) => (item.id === orderId ? { ...item, installerIds: [leadCard, memberCard, outsiderCard] } : item)) },
    revision: ownerNow.revision,
  });
  const leadNow = data<{ payload: { orders: Array<Record<string, unknown>> }; revision: number }>((await lead.call("GET", "/api/v1/legacy-crm/state")).json);
  await lead.call("PUT", "/api/v1/legacy-crm/state", {
    payload: { ...leadNow.payload, orders: leadNow.payload.orders.map((item) => (item.id === orderId ? { ...item, installerIds: [memberCard] } : item)) },
    revision: leadNow.revision,
  });
  const mixed = (await prisma.legacyWorkspace.findUniqueOrThrow({ where: { workspace_id: "primary" } })).payload as { orders: Array<Record<string, unknown>> };
  assert.deepEqual(mixed.orders.find((item) => item.id === orderId)?.installerIds, [outsiderCard, memberCard], "other groups stay on the job");
  assert.equal(storedFinal.orders.find((item) => item.id === orderId)?.priceOverridePerSqft, 99, "prices untouched by the lead's save");
});

test("a new employee is recognised by the CRM without the owner opening it first", async () => {
  // Employees used to see "Доступ не настроен" until the owner's browser
  // happened to synchronize the legacy card. The server now guarantees it.
  await prisma.user.update({ where: { user_id: employeeId }, data: { must_change_password: false } });
  const employee = new Browser();
  await employee.login(employeeEmail, employeePassword);

  const me = await employee.call("GET", "/api/v1/auth/me");
  const legacyIds = data<{ user: { legacy_user_ids: string[] } }>(me.json).user.legacy_user_ids;
  assert.ok(legacyIds.length > 0, "employee has a legacy card id");

  const state = await employee.call("GET", "/api/v1/legacy-crm/state");
  assert.equal(state.status, 200, `state: ${JSON.stringify(state.json).slice(0, 300)}`);
  const cards = (data<{ payload: { users: Array<{ id: string; role: string; name: string }> } }>(state.json).payload.users) ?? [];
  const card = cards.find((candidate) => legacyIds.includes(candidate.id));
  assert.ok(card, "the employee's own card is in their workspace");
  assert.equal(card.role, "measurer", "card role follows PostgreSQL, not the browser");
});

test("a browser save cannot change an employee's role", async () => {
  const manager = new Browser();
  await manager.login(MANAGER_EMAIL, SEED_PASSWORD);
  const state = await manager.call("GET", "/api/v1/legacy-crm/state");
  const { payload, revision } = data<{ payload: { users: Array<Record<string, unknown>> }; revision: number }>(state.json);
  const employeeLegacyIds = (await prisma.user.findUniqueOrThrow({ where: { user_id: employeeId } })).legacy_user_ids;

  const tampered = {
    ...payload,
    users: payload.users.map((card) =>
      employeeLegacyIds.includes(card.id as string) ? { ...card, role: "owner", phone: "+1 805 555 0199" } : card,
    ),
  };
  const saved = await manager.call("PUT", "/api/v1/legacy-crm/state", { payload: tampered, revision });
  assert.equal(saved.status, 200, `save: ${JSON.stringify(saved.json)}`);

  const stored = await prisma.legacyWorkspace.findUniqueOrThrow({ where: { workspace_id: "primary" } });
  const storedCard = ((stored.payload as { users: Array<Record<string, unknown>> }).users).find((card) =>
    employeeLegacyIds.includes(card.id as string),
  );
  assert.equal(storedCard?.role, "measurer", "role is re-applied from PostgreSQL");
  assert.equal(storedCard?.phone, "+1 805 555 0199", "legacy-only fields are still editable");
});

test("owner views the CRM as the employee, read-only, and can leave", async () => {
  const started = await owner.call("POST", "/api/v1/team/preview", { userId: employeeId });
  assert.equal(started.status, 200, `start preview: ${JSON.stringify(started.json)}`);

  const me = await owner.call("GET", "/api/v1/auth/me");
  const viewed = data<{ user: { user_id: string; roles: string[] } }>(me.json).user;
  assert.equal(viewed.user_id, employeeId, "the owner now sees the employee's identity");
  assert.deepEqual(viewed.roles, ["CONSULTANT"]);
  assert.ok((me.json as { data?: { preview?: unknown } }).data?.preview, "preview is flagged");

  const page = await owner.call("GET", "/legacy-crm");
  assert.equal(page.status, 200, "no redirect to the employee's password screen");
  assert.match(String(page.json.raw ?? ""), /./);

  const write = await owner.call("POST", "/api/v1/leads", { name: `${runTag} must not be created` });
  assert.equal(write.status, 403, "writes are blocked during preview");
  const save = await owner.call("PUT", "/api/v1/legacy-crm/state", { payload: {}, revision: 1 });
  assert.equal(save.status, 403, "workspace saves are blocked during preview");
  const recovery = await owner.call("POST", "/api/v1/auth/forgot-password", { email: employeeEmail });
  assert.equal(recovery.status, 403, "public recovery routes are blocked during preview too");
  const sideEffectGet = await owner.call("GET", "/api/v1/integrations/gmail/connect");
  assert.equal(sideEffectGet.status, 403, "side-effecting GET routes are blocked during preview");
  assert.equal(await prisma.lead.count({ where: { name: { startsWith: runTag } } }), 0);

  // Preview must not write: an unlinked employee stays unlinked while viewed.
  await prisma.user.update({ where: { user_id: employeeId }, data: { legacy_user_ids: { set: [] } } });
  await owner.call("GET", "/api/v1/auth/me");
  await owner.call("GET", "/api/v1/legacy-crm/state");
  const untouched = await prisma.user.findUniqueOrThrow({ where: { user_id: employeeId } });
  assert.deepEqual(untouched.legacy_user_ids, [], "preview reads do not persist identity links");

  const stopped = await owner.call("DELETE", "/api/v1/team/preview");
  assert.equal(stopped.status, 200);
  const back = await owner.call("GET", "/api/v1/auth/me");
  assert.ok(data<{ user: { roles: string[] } }>(back.json).user.roles.includes("OWNER"), "owner is back");
});

test("logging out ends the preview", async () => {
  const started = await owner.call("POST", "/api/v1/team/preview", { userId: employeeId });
  assert.equal(started.status, 200);
  await owner.call("POST", "/api/v1/auth/logout");
  assert.equal(owner.cookies.has("rolanpro_preview_as"), false, "preview cookie cleared on logout");
  await owner.login(OWNER_EMAIL, SEED_PASSWORD);
  const me = await owner.call("GET", "/api/v1/auth/me");
  assert.ok(data<{ user: { roles: string[] } }>(me.json).user.roles.includes("OWNER"));
});

test("a new login never lands inside an earlier preview", async () => {
  const started = await owner.call("POST", "/api/v1/team/preview", { userId: employeeId });
  assert.equal(started.status, 200);
  await owner.login(OWNER_EMAIL, SEED_PASSWORD);
  assert.equal(owner.cookies.has("rolanpro_preview_as"), false, "login clears the preview cookie");
  const me = await owner.call("GET", "/api/v1/auth/me");
  assert.ok(data<{ user: { roles: string[] } }>(me.json).user.roles.includes("OWNER"));
});

test("only the owner can start a preview, and another employee cannot use the cookie", async () => {
  const manager = new Browser();
  await manager.login(MANAGER_EMAIL, SEED_PASSWORD);
  const ownerRowForForgery = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
  const denied = await manager.call("POST", "/api/v1/team/preview", { userId: employeeId });
  assert.equal(denied.status, 403);

  const ownerRow = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
  const secondOwner = await prisma.user.findFirst({
    where: { user_id: { not: ownerRow.user_id }, user_accesses: { some: { role: { code: "OWNER" } } } },
  });
  if (secondOwner) {
    const ownerPreview = await owner.call("POST", "/api/v1/team/preview", { userId: secondOwner.user_id });
    assert.equal(ownerPreview.status, 400, "another owner cannot be previewed");
  }

  manager.cookies.set("rolanpro_preview_as", `${employeeId}.${ownerRowForForgery.user_id}`);
  const me = await manager.call("GET", "/api/v1/auth/me");
  assert.ok(
    data<{ user: { roles: string[] } }>(me.json).user.roles.includes("MANAGER"),
    "a forged preview cookie is ignored for non-owners",
  );
});
