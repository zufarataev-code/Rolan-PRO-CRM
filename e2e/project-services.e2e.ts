import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { assertSafeE2eTarget, assertServerUsesTestDatabase } from "./guard";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
assertSafeE2eTarget(base);
const db = new PrismaClient();
let managerCookie = "", installerCookie = "", projectId = "", clientId = "";
let installerId = "", secondInstallerId = "";
let positions: string[] = [];
async function request(cookie: string, method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const json = await response.json();
  return { status: response.status, data: json.data, errors: json.errors };
}
async function login(email: string) {
  const response = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: process.env.E2E_SEED_PASSWORD ?? "ChangeMe123!" }) });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
before(async () => {
  await assertServerUsesTestDatabase(base, db);
  await db.user.updateMany({ where: { email: { in: ["manager@rolanpro.local", "installer@rolanpro.local"] } }, data: { must_change_password: false } });
  managerCookie = await login("manager@rolanpro.local");
  installerCookie = await login("installer@rolanpro.local");
  const manager = await db.user.findUniqueOrThrow({ where: { email: "manager@rolanpro.local" } });
  installerId = (await db.user.findUniqueOrThrow({ where: { email: "installer@rolanpro.local" } })).user_id;
  secondInstallerId = (await db.user.findUniqueOrThrow({ where: { email: "installer2@rolanpro.local" } })).user_id;
  const status = await db.projectStatus.findUniqueOrThrow({ where: { status_code: "NEW" } });
  const positionStatus = await db.positionStatus.findUniqueOrThrow({ where: { status_code: "READY" } });
  const service = await db.serviceType.findFirstOrThrow({ where: { service_code: "SOLAR_FILM" } });
  const client = await db.client.create({ data: { name: `E2E service execution ${Date.now()}` } });
  clientId = client.client_id;
  const project = await db.project.create({ data: {
    client_id: clientId, manager_id: manager.user_id, project_status_id: status.project_status_id,
    title: "E2E service work orders", address: "Disposable test fixture",
    project_positions: { create: [100, 200, 300].map((sqft, index) => ({
      service_type_id: service.service_type_id, position_status_id: positionStatus.position_status_id,
      title: `Service ${index + 1}`, actual_price: 9999,
      dynamic_fields: { sqft, manual_installation_cost_per_sqft: 5 }, sort_order: index,
    })) },
  }, include: { project_positions: { orderBy: { sort_order: "asc" } } } });
  projectId = project.project_id;
  positions = project.project_positions.map(row => row.position_id);
});
after(async () => {
  if (projectId) await db.project.delete({ where: { project_id: projectId } });
  if (clientId) await db.client.delete({ where: { client_id: clientId } });
  await db.$disconnect();
});

test("services have scoped work orders, independent dates and idempotent payouts; unscheduled services stay open", async () => {
  const phase = await request(managerCookie, "POST", `/api/v1/projects/${projectId}/phases`, {
    title: "First visit", starts_at: "2026-10-05T16:00:00Z", ends_at: "2026-10-05T20:00:00Z",
    position_ids: positions.slice(0, 2), assignments: [
      { project_position_id: positions[0], installer_id: installerId },
      { project_position_id: positions[1], installer_id: secondInstallerId },
    ],
  });
  assert.equal(phase.status, 200, JSON.stringify(phase.errors));
  const eventId = phase.data.phase.calendar_event_id;
  const workOrder = await request(installerCookie, "GET", `/api/v1/project-service-events/${eventId}`);
  assert.equal(workOrder.status, 200);
  assert.equal(workOrder.data.item.installer_jobs.length, 1);
  assert.equal(workOrder.data.item.installer_jobs[0].position.position_id, positions[0]);
  assert.equal(workOrder.data.item.starts_at, "2026-10-05T16:00:00.000Z");
  const publicText = JSON.stringify(workOrder.data);
  assert.ok(!publicText.includes('"actual_price"') && !publicText.includes('"dynamic_fields"') && !publicText.includes("9999"));
  assert.equal((await request(installerCookie, "POST", `/api/v1/projects/${projectId}/phases/${eventId}/complete`)).status, 403);
  const first = await request(managerCookie, "POST", `/api/v1/projects/${projectId}/phases/${eventId}/complete`);
  assert.equal(first.status, 200);
  assert.equal(first.data.project_completed, false, "unscheduled service 3 must keep the project open");
  const accrual = await db.installerPayrollAccrual.findFirstOrThrow({ where: { project_id: projectId, installer_id: installerId } });
  assert.equal(Number(accrual.amount), 500);
  assert.equal(Number(accrual.quantity_sqft), 100);
  await db.projectPosition.update({ where: { position_id: positions[0] }, data: { dynamic_fields: { sqft: 999, manual_installation_cost_per_sqft: 99 } } });
  const repeat = await request(managerCookie, "POST", `/api/v1/projects/${projectId}/phases/${eventId}/complete`);
  assert.equal(repeat.data.already_completed, true);
  assert.equal(await db.installerPayrollAccrual.count({ where: { project_id: projectId } }), 2);
  assert.equal(Number((await db.installerPayrollAccrual.findUniqueOrThrow({ where: { payroll_accrual_id: accrual.payroll_accrual_id } })).amount), 500);
  const last = await request(managerCookie, "POST", `/api/v1/projects/${projectId}/phases`, {
    title: "Later service", starts_at: "2026-10-07T16:00:00Z", ends_at: "2026-10-07T20:00:00Z",
    position_ids: [positions[2]], assignments: [{ project_position_id: positions[2], installer_id: secondInstallerId }],
  });
  assert.equal(last.status, 200);
  const lastId = last.data.phase.calendar_event_id;
  assert.equal((await request(installerCookie, "GET", `/api/v1/project-service-events/${lastId}`)).status, 404);
  const done = await request(managerCookie, "POST", `/api/v1/projects/${projectId}/phases/${lastId}/complete`);
  assert.equal(done.status, 200);
  assert.equal(done.data.project_completed, true);
  assert.equal(await db.installerPayrollAccrual.count({ where: { project_id: projectId } }), 3);
});
