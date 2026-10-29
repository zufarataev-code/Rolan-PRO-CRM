import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { assertServerUsesTestDatabase } from "./guard";

async function main() {
  const db = new PrismaClient();
  const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
  await assertServerUsesTestDatabase(base, db);
  const { chromium } = createRequire(process.cwd() + "/package.json")(process.env.E2E_PLAYWRIGHT_MODULE || "playwright");
  const owner = await db.user.findFirstOrThrow({ where: { is_active: true, user_accesses: { some: { role: { code: "OWNER" } } } } });
  const original = await db.legacyWorkspace.findUnique({ where: { workspace_id: "primary" } });
  const password = randomUUID(), submission = randomUUID();
  let browser: any, leadId = "";
  async function signed(method: string, body: unknown) {
    const raw = JSON.stringify(body), timestamp = String(Math.floor(Date.now() / 1000));
    assert.ok(process.env.WEBSITE_LEAD_INGEST_SECRET);
    const signature = createHmac("sha256", process.env.WEBSITE_LEAD_INGEST_SECRET).update(`${timestamp}.${raw}`).digest("hex");
    const response = await fetch(base + "/api/v1/integrations/website/leads", { method, headers: { "content-type": "application/json", "x-rolan-timestamp": timestamp, "x-rolan-signature": signature }, body: raw });
    assert.equal(response.status, 200);
    return response.json();
  }
  try {
    await db.user.update({ where: { user_id: owner.user_id }, data: { password_hash: hashPassword(password), must_change_password: false } });
    leadId = (await signed("POST", { submission_id: submission, name: "Website browser fixture", notes: "Original website quote" })).lead_id;
    await signed("PATCH", { submission_id: submission, event_id: randomUUID(), revision: 1, occurred_at: new Date().toISOString(), contact: {}, follow_up: { kind: "callback_requested", message: "Browser callback fixture <script>throw new Error('unsafe')</script>" } });
    browser = await chromium.launch({ headless: true });
    await mkdir("test-results/website-followups", { recursive: true });
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const login = await context.request.post(base + "/api/v1/auth/login", { data: { email: owner.email, password } });
      assert.equal(login.status(), 200);
      await context.addCookies((await context.cookies()).map((cookie: any) => ({ ...cookie, secure: false })));
      const page = await context.newPage(), errors: string[] = [];
      page.on("pageerror", (error: Error) => errors.push(error.message));
      await page.goto(base + "/legacy-crm", { waitUntil: "networkidle" });
      await page.waitForFunction(() => typeof (window as any).selectAppView === "function");
      await page.evaluate(() => (window as any).selectAppView("leads"));
      await page.locator("[data-website-updates]").waitFor();
      assert.match(await page.locator("[data-website-updates]").innerText(), /Browser callback fixture <script>/);
      assert.equal(await page.locator("[data-website-updates] script").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      await page.screenshot({ path: `test-results/website-followups/inbox-${width}.png`, fullPage: true });
      // Explicit real CRM conversion on disposable data, preserving canonicalLeadId.
      await page.locator(".card").filter({ hasText: "Website browser fixture" }).first().getByRole("button", { name: "➕ Создать проект", exact: true }).click();
      await page.locator(".project-feed [data-website-updates]").waitFor();
      assert.match(await page.locator(".project-feed [data-website-updates]").innerText(), /Browser callback fixture/);
      // Later customer corrections must reach the same converted project via
      // normal polling, without a reload or a second project being created.
      const nextRevision = width === 390 ? 2 : 3;
      const laterMessage = `Customer follow-up after project conversion at ${width}px`;
      await signed("PATCH", { submission_id: submission, event_id: randomUUID(), revision: nextRevision, occurred_at: new Date().toISOString(), contact: {}, follow_up: { kind: "quote_updated", message: laterMessage } });
      await page.waitForFunction((message: string) => Array.from(document.querySelectorAll(".project-feed [data-website-updates]")).some(node => node.textContent?.includes(message)), laterMessage, { timeout: 20000 });
      const lead = await db.lead.findUniqueOrThrow({ where: { lead_id: leadId }, include: { pipeline_status: true } });
      assert.equal(lead.pipeline_status.status_code, "CONTACTED");
      assert.equal(lead.notes, "Original website quote");
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `test-results/website-followups/project-${width}.png`, fullPage: true });
      await context.close();
      // Restore only disposable workspace for the second viewport's conversion.
      if (original) await db.legacyWorkspace.update({ where: { workspace_id: "primary" }, data: { payload: original.payload as any, revision: { increment: 1 } } });
      else await db.legacyWorkspace.deleteMany({ where: { workspace_id: "primary" } });
      const open = await db.pipelineStatus.findUniqueOrThrow({ where: { status_code: "NEW_LEAD" } });
      await db.lead.update({ where: { lead_id: leadId }, data: { pipeline_status_id: open.pipeline_status_id, claimed_at: null, claimed_by_user_id: null } });
      console.log(`Website follow-ups visible in inbox and converted project: ${width}px passed`);
    }
  } finally {
    await browser?.close();
    await db.user.update({ where: { user_id: owner.user_id }, data: { password_hash: owner.password_hash, must_change_password: owner.must_change_password } });
    if (original) await db.legacyWorkspace.update({ where: { workspace_id: "primary" }, data: { payload: original.payload as any, revision: { increment: 1 } } });
    else await db.legacyWorkspace.deleteMany({ where: { workspace_id: "primary" } });
    if (leadId) {
      await db.activityLog.deleteMany({ where: { entity_id: leadId } });
      await db.acquisitionTouchpoint.deleteMany({ where: { lead_id: leadId } });
      await db.consentSnapshot.deleteMany({ where: { lead_id: leadId } });
      await db.lead.deleteMany({ where: { lead_id: leadId } });
    }
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
