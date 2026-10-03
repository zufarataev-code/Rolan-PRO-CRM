// Run separately from the HTTP suite, after installing the pinned browser tools.
// All writes are confined to the same disposable database guarded by HTTP E2E.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { assertServerUsesTestDatabase } from "./guard";

async function main() {
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const db = new PrismaClient();
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require(process.env.E2E_PLAYWRIGHT_MODULE || "playwright");
let browser: any;
let projectId = "", clientId = "";
await assertServerUsesTestDatabase(base, db);
await mkdir("test-results/service-execution", { recursive: true });
try {
  await db.user.updateMany({ where: { email: { in: ["manager@rolanpro.local", "installer@rolanpro.local"] } }, data: { must_change_password: false } });
  const manager = await db.user.findUniqueOrThrow({ where: { email: "manager@rolanpro.local" } });
  const installer = await db.user.findUniqueOrThrow({ where: { email: "installer@rolanpro.local" } });
  const status = await db.projectStatus.findUniqueOrThrow({ where: { status_code: "NEW" } });
  const positionStatus = await db.positionStatus.findUniqueOrThrow({ where: { status_code: "READY" } });
  const service = await db.serviceType.findUniqueOrThrow({ where: { service_code: "SOLAR_FILM" } });
  const client = await db.client.create({ data: { name: "Browser QA client" } });
  clientId = client.client_id;
  const project = await db.project.create({ data: {
    client_id: clientId, manager_id: manager.user_id, project_status_id: status.project_status_id,
    title: "Проверка выполнения услуг", site_type: "RESIDENTIAL", address: "100 Test Avenue",
    project_positions: { create: { service_type_id: service.service_type_id, position_status_id: positionStatus.position_status_id,
      title: "Солнцезащитная плёнка · гостиная", actual_price: 9876,
      dynamic_fields: { sqft: 100, manual_installation_cost_per_sqft: 5 } } },
  } });
  projectId = project.project_id;
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "America/Los_Angeles" });
    const login = await context.request.post(base + "/api/v1/auth/login", { data: {
      email: "manager@rolanpro.local", password: process.env.E2E_SEED_PASSWORD ?? "ChangeMe123!",
    } });
    assert.equal(login.status(), 200);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    page.on("dialog", (dialog: any) => dialog.dismiss());
    try {
      await page.goto(base + `/legacy-crm#/projects/${projectId}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Дата, исполнитель и заказ-наряд" }).click();
      await page.getByRole("dialog", { name: "Выполнение услуги" }).waitFor();
      if (width === 390) {
        for (const selector of ["#cs-title", "#cs-start", "#cs-end", "#cs-installer"]) {
          const height = await page.locator(selector).evaluate((el: HTMLElement) => el.getBoundingClientRect().height);
          assert.ok(height >= 44, `${selector} must be touch-sized, got ${height}px`);
        }
        await page.locator("#cs-start").fill("2026-10-05T09:00");
        await page.locator("#cs-end").fill("2026-10-05T12:00");
        await page.locator("#cs-installer").selectOption(installer.user_id);
        await page.locator("#cs-notes").fill("Проверить стекло перед установкой");
        await page.screenshot({ path: `test-results/service-execution/schedule-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: "Назначить услугу", exact: true }).click();
      }
      await page.getByRole("button", { name: "Заказ-наряд", exact: true }).waitFor();
      await page.screenshot({ path: `test-results/service-execution/assigned-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Заказ-наряд", exact: true }).click();
      await page.getByText("Заказ-наряд услуги", { exact: true }).waitFor();
      await page.getByText("100 Test Avenue", { exact: true }).waitFor();
      await page.screenshot({ path: `test-results/service-execution/work-order-${width}.png`, fullPage: true });
      const dimensions = await page.locator(".modal-content").evaluate((el: HTMLElement) => ({
        width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      }));
      assert.ok(dimensions.width <= width, JSON.stringify(dimensions));
      assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `Modal overflow: ${JSON.stringify(dimensions)}`);
      assert.ok(!(await page.locator(".modal-content").innerText()).includes("9876"));
      assert.deepEqual(errors, [], "CRM browser JavaScript errors");
      console.log(`Service execution browser flow passed at ${width}px`);
    } catch (error) {
      await page.screenshot({ path: `test-results/service-execution/failure-${width}.png`, fullPage: true });
      console.error("Browser errors:", errors);
      throw error;
    } finally { await context.close(); }
  }
  const jobs = await db.installerJob.findMany({ where: { project_id: projectId }, include: { calendar_event: true } });
  assert.equal(jobs.length, 1, "desktop reopens the same service instead of duplicating it");
  assert.equal(jobs[0].calendar_event?.starts_at.toISOString(), "2026-10-05T16:00:00.000Z");
} finally {
  await browser?.close();
  if (projectId) await db.project.delete({ where: { project_id: projectId } });
  if (clientId) await db.client.delete({ where: { client_id: clientId } });
  await db.$disconnect();
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
