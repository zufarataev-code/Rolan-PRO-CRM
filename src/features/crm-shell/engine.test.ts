import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { composeEngineSource, resolveTimeZone, runCrmEngine } from "./engine";
import { CRM_LEGACY_SECTIONS, crmNavFor, crmSectionSrc } from "./nav";
import type { CrmOverview, CrmProjectPage, CrmProjectsBoard } from "./types";

const source = composeEngineSource();
const script = new vm.Script(source);
// The CRM's own demo workspace, produced by the CRM's own code.
const payload = runCrmEngine<Record<string, unknown>>(null, { legacyUserIds: [], role: "owner" }, { model: "overview" },
  new vm.Script(`${source}\ncrmShellRun = function () { seedDemo(); migrateSchema(); return JSON.stringify(db); };`));
const owner = { legacyUserIds: ["u_o1"], role: "owner" as const, timeZone: "America/Los_Angeles" };

test("the overview is the CRM's own numbers for the signed-in owner", () => {
  const overview = runCrmEngine<CrmOverview>(payload, owner, { model: "overview" }, script);
  assert.equal(overview.user.id, "u_o1");
  assert.equal(overview.activeCount, 2);
  assert.equal(Math.round(overview.activeRevenue), 3236);
  assert.deepEqual(overview.funnel.map((stage) => stage.id), ["lead", "consult", "measure", "proposal", "install", "payment"]);
  assert.equal(overview.attention[0]?.next, "Монтаж назначен");
});

test("the funnel has the CRM kanban's columns and each card carries its next step", () => {
  const board = runCrmEngine<CrmProjectsBoard>(payload, { legacyUserIds: ["u_m1"], role: "manager" }, { model: "projects" }, script);
  assert.equal(board.user.role, "manager");
  assert.deepEqual(board.columns.map((column) => column.id), ["lead", "consult", "measure", "proposal", "install", "payment", "done"]);
  const install = board.columns.find((column) => column.id === "install");
  assert.equal(install?.cards[0]?.number, "R-2604-001");
  assert.equal(install?.cards[0]?.status, "Монтаж назначен");
  assert.equal(install?.cards[0]?.address, "Los Angeles, CA, 633 W 5th St");
});

test("a project shows the working card's nine stages, services and windows", () => {
  const page = runCrmEngine<CrmProjectPage>(payload, owner, { model: "project", projectId: "o1" }, script);
  const project = page.project;
  assert.ok(project);
  assert.deepEqual(project.stages.map((stage) => stage.label), ["Новый", "Консультация", "Замер", "КП", "Производство", "Монтаж", "Акт", "Оплата", "Готово"]);
  assert.equal(project.stages.find((stage) => stage.state === "current")?.label, "Монтаж");
  assert.equal(project.stageDone, 5);
  assert.equal(project.lines.length, 1);
  assert.equal(project.windows.length, 3);
  assert.equal(project.canSeeMoney, true);
  assert.equal(runCrmEngine<CrmProjectPage>(payload, owner, { model: "project", projectId: "missing" }, script).project, null);
});

test("a project with its own address shows it, and an unknown status is not work in progress", () => {
  const changed = JSON.parse(JSON.stringify(payload)) as { orders: Record<string, unknown>[] };
  changed.orders[0].address = "Pasadena, CA, 1 Job Site Rd";
  changed.orders[1].status = "cancelled";
  const overview = runCrmEngine<CrmOverview>(changed, owner, { model: "overview" }, script);
  assert.deepEqual(overview.attention.map((card) => card.id), ["o1"]);
  assert.equal(overview.attention[0].address, "Pasadena, CA, 1 Job Site Rd");
});

test("no CRM card of an office role — no data", () => {
  assert.deepEqual(runCrmEngine(payload, { legacyUserIds: [], role: "owner" }, { model: "overview" }, script), { error: "no_card" });
  assert.deepEqual(runCrmEngine(payload, { legacyUserIds: ["u_i1", "u_z1"], role: "manager" }, { model: "projects" }, script), { error: "no_card" });
});

test("the calculation changes neither the workspace it was given nor the server's time zone", () => {
  const before = JSON.stringify(payload);
  const zone = process.env.TZ;
  runCrmEngine(payload, { ...owner, timeZone: "Asia/Tashkent" }, { model: "overview" }, script);
  assert.equal(JSON.stringify(payload), before);
  assert.equal(process.env.TZ, zone);
  assert.equal(resolveTimeZone("Not/AZone"), "America/Los_Angeles");
  assert.equal(resolveTimeZone("Asia/Tashkent"), "Asia/Tashkent");
});

test("every old section in the new menu is one the working CRM agrees to open by address", () => {
  const allowed = source.match(/function crmSectionOpenAllowed\(key\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(allowed);
  for (const item of CRM_LEGACY_SECTIONS) assert.ok(allowed.includes(`'${item.key}'`), item.key);
  const ownerOnly = allowed.match(/if \(\[(.*?)\]\.includes\(key\)\) return role === 'owner'/)?.[1] ?? "";
  for (const item of CRM_LEGACY_SECTIONS.filter((entry) => entry.ownerOnly)) assert.ok(ownerOnly.includes(`'${item.key}'`), item.key);
  const managerTitles = crmNavFor("manager").flatMap((group) => group.items).map((item) => item.title);
  assert.ok(!managerTitles.includes("Деньги") && !managerTitles.includes("Настройки"));
  assert.ok(CRM_LEGACY_SECTIONS.some((item) => item.key === "orders"));
  assert.equal(crmSectionSrc("leads", "manager")?.src, "/legacy-crm#/section/leads");
  assert.equal(crmSectionSrc("servicePricing", "manager")?.src, "/legacy-crm#/service-pricing");
  assert.equal(crmSectionSrc("installerOps", "owner")?.src, "/legacy-crm#/installer-operations");
  assert.equal(crmSectionSrc("accounting", "manager"), null);
  assert.equal(crmSectionSrc("anything", "owner"), null);
});
