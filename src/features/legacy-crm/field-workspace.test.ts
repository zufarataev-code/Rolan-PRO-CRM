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

test("an installer receives the owner's installer rate directory; a surveyor does not", () => {
  const payload = {
    users: [{ id: "u_i1", role: "installer", name: "Installer" }],
    orders: [],
    settings: {
      companyName: "Rolan PRO",
      installerRates: { serviceTypes: { SMART_FILM: 6, SAFETY_FILM: 3 }, workTypes: { connect: 50 } },
      pricePerM2: 99,
    },
  };
  const installer = createFieldWorkspace(payload, [ROLE_CODES.INSTALLER], ["u_i1"]);
  assert.deepEqual(installer.settings.installerRates, { serviceTypes: { SMART_FILM: 6, SAFETY_FILM: 3 }, workTypes: { connect: 50 } });
  assert.equal("pricePerM2" in installer.settings, false, "client prices stay hidden");
  const surveyor = createFieldWorkspace(payload, [ROLE_CODES.CONSULTANT], ["u_z1"]);
  assert.equal("installerRates" in surveyor.settings, false);
});

test("a finished measurement is announced to the manager and the owner by the server", () => {
  const base = structuredClone(workspace) as Record<string, any>;
  base.users.push({ id: "manager", role: "manager", name: "Manager" });
  base.orders[0].managerId = "manager";
  base.orders[0].number = "R-1";
  base.notifications = [{ id: "old", userId: "owner", title: "Old", body: "", readAt: null, createdAt: "2026-01-01T00:00:00.000Z" }];
  const submitted = createFieldWorkspace(base, [ROLE_CODES.CONSULTANT], ["measure"]) as Record<string, any>;
  submitted.orders[0].status = "measurement_done";
  // A notice written in the field browser is never trusted or kept.
  submitted.notifications = [{ id: "forged", userId: "manager", title: "Forged", body: "x", readAt: null, createdAt: "2026-01-01T00:00:00.000Z" }];

  const merged = mergeFieldWorkspace(base, submitted, [ROLE_CODES.CONSULTANT], ["measure"]) as Record<string, any>;
  assert.equal(merged.orders[0].status, "measurement_done");
  const fresh = merged.notifications.filter((item: any) => item.source === "measurement_done");
  assert.deepEqual(fresh.map((item: any) => item.userId).sort(), ["manager", "owner"]);
  assert.equal(fresh[0].link, "#/order/order-a");
  assert.match(fresh[0].title, /R-1/);
  assert.equal(merged.notifications.some((item: any) => item.id === "forged"), false);
  assert.equal(merged.notifications.some((item: any) => item.id === "old"), true);

  // Saving the same finished measurement again does not repeat the notice.
  const again = mergeFieldWorkspace(merged, submitted, [ROLE_CODES.CONSULTANT], ["measure"]) as Record<string, any>;
  assert.equal(again.notifications.filter((item: any) => item.source === "measurement_done").length, 2);
});
