import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ROLE_CODES } from "@/lib/auth/constants";
import { createFieldWorkspace, mergeFieldWorkspace } from "./field-workspace";

const workspace = {
  users: [
    { id: "owner", role: "owner", name: "Owner", hourlyRate: 100 },
    { id: "measure", role: "measurer", name: "Alan", commissionPct: 10 },
    { id: "install", role: "installer", name: "Installer", payConfig: { ratePerSqft: 5 } },
  ],
  clients: [
    { id: "client-a", name: "Assigned", phone: "+1", lifetimeValue: 10000 },
    { id: "client-b", name: "Other", phone: "+2" },
  ],
  orders: [
    {
      id: "order-a",
      clientId: "client-a",
      managerId: "owner",
      measurerId: "measure",
      installerIds: ["install"],
      status: "measurement_scheduled",
      pricePerM2: 125,
      paid: 500,
      measurements: {
        rooms: [{ id: "room", windows: [{ id: "window", width: 100, pricePerSqft: 25 }] }],
      },
      timeline: [
        { key: "measurement_scheduled" },
        { key: "payment_received", amount: 500 },
      ],
    },
    {
      id: "order-b",
      clientId: "client-b",
      measurerId: "someone-else",
      installerIds: [],
      status: "new",
      pricePerM2: 200,
    },
  ],
  notifications: [{ id: "n1", orderId: "order-a" }, { id: "n2", orderId: "order-b" }],
  tasks: [
    { id: "task-a", teamIds: ["measure"], responsibleId: "measure", status: "open", createdBy: "owner" },
    { id: "task-b", teamIds: ["someone-else"], responsibleId: "someone-else", status: "open" },
  ],
  settings: {
    companyName: "Rolan PRO",
    currency: "$",
    catalog: [{ id: "film", brand: "Rolan", model: "SP-5", retailPerSqft: 20, materialCost: 3 }],
    companyOverhead: 10000,
    stripe: { secretKey: "secret" },
  },
  vendors: [{ id: "vendor", name: "Supplier", dealerPrice: 4 }],
  inventory: [{ id: "roll", catalogId: "film", costTotal: 500 }],
  purchaseRequests: [{ id: "request", itemId: "film", quotedPrice: 300 }],
};

test("surveyor receives only assigned work and no customer or company money", () => {
  const field = createFieldWorkspace(workspace, [ROLE_CODES.CONSULTANT], ["measure"]);
  const orders = field.orders as Array<Record<string, unknown>>;
  const clients = field.clients as Array<Record<string, unknown>>;
  const settings = field.settings as Record<string, unknown>;

  assert.deepEqual(field._allowedLegacyUserIds, ["measure"]);
  assert.deepEqual(orders.map((order) => order.id), ["order-a"]);
  assert.deepEqual(clients.map((client) => client.id), ["client-a"]);
  assert.equal("pricePerM2" in orders[0], false);
  assert.equal("paid" in orders[0], false);
  assert.equal("lifetimeValue" in clients[0], false);
  assert.equal("companyOverhead" in settings, false);
  assert.equal("stripe" in settings, false);
  assert.equal("vendors" in field, false);
  assert.equal("inventory" in field, false);
  assert.equal("purchaseRequests" in field, false);
  assert.equal(
    (orders[0].timeline as Array<{ key: string }>).some((event) => event.key === "payment_received"),
    false,
  );
  const film = settings.catalog as Array<Record<string, unknown>>;
  assert.equal("retailPerSqft" in film[0], false);
  assert.equal("materialCost" in film[0], false);
  assert.deepEqual((field.tasks as Array<Record<string, unknown>>).map((task) => task.id), ["task-a"]);
});

test("installer receives only their own compensation configuration", () => {
  const field = createFieldWorkspace(workspace, [ROLE_CODES.INSTALLER], ["install"]);
  const users = field.users as Array<Record<string, unknown>>;
  const installer = users.find((user) => user.id === "install");
  const owner = users.find((user) => user.id === "owner");

  assert.deepEqual(installer?.payConfig, { ratePerSqft: 5 });
  assert.equal("hourlyRate" in (owner || {}), false);
});

test("server role change immediately switches a linked legacy card from surveyor to installer", () => {
  const transitionedWorkspace = {
    ...workspace,
    orders: [
      ...workspace.orders,
      {
        id: "order-install-after-role-change",
        clientId: "client-b",
        measurerId: "someone-else",
        installerIds: ["measure"],
        status: "installation_scheduled",
      },
    ],
  };

  const field = createFieldWorkspace(
    transitionedWorkspace,
    [ROLE_CODES.INSTALLER],
    ["measure"],
  );
  const users = field.users as Array<Record<string, unknown>>;
  const orders = field.orders as Array<Record<string, unknown>>;

  assert.equal(users.find((user) => user.id === "measure")?.role, "installer");
  assert.deepEqual(orders.map((order) => order.id), ["order-install-after-role-change"]);
});

test("field save updates operational facts but cannot change money or assignments", () => {
  const submitted = createFieldWorkspace(workspace, [ROLE_CODES.CONSULTANT], ["measure"]);
  const submittedOrders = submitted.orders as Array<Record<string, unknown>>;
  submittedOrders[0].status = "measurement_done";
  submittedOrders[0].measurements = {
    rooms: [{ id: "room", windows: [{ id: "window", width: 200 }] }],
  };
  submittedOrders[0].pricePerM2 = 1;
  submittedOrders[0].measurerId = "attacker";
  const submittedTasks = submitted.tasks as Array<Record<string, unknown>>;
  submittedTasks[0].status = "done";
  submittedTasks[0].doneAt = "2026-09-02T12:00:00Z";

  const merged = mergeFieldWorkspace(workspace, submitted, [ROLE_CODES.CONSULTANT], ["measure"]);
  const order = (merged.orders as Array<Record<string, unknown>>)[0];

  assert.equal(order.status, "measurement_done");
  assert.deepEqual(order.measurements, {
    rooms: [{ id: "room", windows: [{ id: "window", width: 200, pricePerSqft: 25 }] }],
  });
  assert.equal(order.pricePerM2, 125);
  assert.equal(order.measurerId, "measure");
  assert.equal((merged.tasks as Array<Record<string, unknown>>)[0].status, "done");
  assert.equal(
    (order.timeline as Array<{ key: string }>).some((event) => event.key === "payment_received"),
    true,
  );

  submittedOrders[0].status = "completed";
  const forbiddenStatus = mergeFieldWorkspace(workspace, submitted, [ROLE_CODES.CONSULTANT], ["measure"]);
  assert.equal((forbiddenStatus.orders as Array<Record<string, unknown>>)[0].status, "measurement_scheduled");
});

test("installer workday stays inside the actual legacy CRM after duplicate shell removal", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(html, /\['workday', 'Рабочий день', '⏱'\]/);
  assert.match(html, /function renderCanonicalInstallerWorkday\(\)/);
  assert.match(html, /\/api\/v1\/installer-work-sessions/);
  assert.match(html, /Рабочая геолокация/);
});

test("an employee with surveyor and installer cards keeps both roles in their workspace", async () => {
  const { createFieldWorkspace } = await import("./field-workspace");
  const payload = {
    users: [
      { id: "u_z1", role: "measurer", name: "Alan" },
      { id: "u_i1", role: "installer", name: "Alan" },
    ],
    orders: [],
  };
  const workspace = createFieldWorkspace(payload, ["CONSULTANT", "INSTALLER"], ["u_z1", "u_i1"]) as unknown as {
    users: Array<{ id: string; role: string }>;
  };
  const roles = Object.fromEntries(workspace.users.map((user) => [user.id, user.role]));
  assert.equal(roles.u_z1, "measurer");
  assert.equal(roles.u_i1, "installer");
});

test("a team lead distributes only installer cards and the distribution is recorded", async () => {
  const { mergeFieldWorkspace } = await import("./field-workspace");
  const current = {
    users: [
      { id: "u_lead", role: "installer" },
      { id: "u_lead_measurer", role: "measurer" },
      { id: "u_i2", role: "installer", groupLeadId: "u_lead" },
      { id: "u_i2_measurer", role: "measurer", groupLeadId: "u_lead" },
    ],
    orders: [{ id: "o1", installerIds: ["u_i2"], timeline: [] }],
  };
  const submitted = {
    orders: [
      {
        id: "o1",
        installerIds: ["u_i2", "u_i2_measurer", "u_lead_measurer"],
        timeline: [
          { at: "2026-09-30T10:00:00.000Z", key: "crew_distributed", by: "u_lead", note: "Бригада: u_i2" },
          { at: "2026-09-30T10:00:01.000Z", key: "payment_received", note: "forged" },
        ],
      },
    ],
  };
  const merged = mergeFieldWorkspace(
    current,
    submitted,
    ["INSTALLER", "INSTALLER_LEAD", "CONSULTANT"],
    ["u_lead", "u_lead_measurer"],
  ) as unknown as { orders: Array<{ installerIds: string[]; timeline: Array<{ key: string }> }> };
  assert.deepEqual(merged.orders[0].installerIds, ["u_i2"], "surveyor cards never become crew");
  assert.deepEqual(merged.orders[0].timeline.map((event) => event.key), ["crew_distributed"]);
});

test("completing a job snapshots team leads on the server", async () => {
  const { mergeFieldWorkspace } = await import("./field-workspace");
  const current = {
    users: [
      { id: "u_lead", role: "installer", installerLead: true },
      { id: "u_i2", role: "installer", groupLeadId: "u_lead" },
    ],
    orders: [{ id: "o1", status: "installation_in_progress", installerIds: ["u_i2"] }],
  };
  const merged = mergeFieldWorkspace(
    current,
    { orders: [{ id: "o1", status: "installation_done", installerLeadAtCompletion: { u_i2: "forged" } }] },
    ["INSTALLER"],
    ["u_i2"],
  ) as unknown as { orders: Array<{ status: string; installerLeadAtCompletion?: Record<string, string | null> }> };
  assert.equal(merged.orders[0].status, "installation_done");
  assert.deepEqual(merged.orders[0].installerLeadAtCompletion, { u_i2: "u_lead" });
});
