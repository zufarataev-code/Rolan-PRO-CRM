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
