import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { LEAD_STAGES } from "../sales/lead-stages";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
function fn(name: string) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
  assert.ok(match, name);
  return match[0];
}
function fixture() {
  const rows = [
    { id: "active", canonical: true, name: "Active fixture", source: "meta_lead_ads", statusCode: "QUALIFIED", stageCode: "QUALIFIED", stageName: "Квалифицирован", stageClosed: false },
    { id: "closed", canonical: true, name: "Rejected fixture", source: "website", statusCode: "DISQUALIFIED", stageCode: "DISQUALIFIED", stageName: "Не квалифицирован", stageClosed: true },
  ];
  const calls: Array<{ url: string; options: any }> = [];
  const context: any = vm.createContext({
    db: { settings: {}, orders: [] }, state: {}, canonicalLeadsRefreshedAt: Date.now(), canonicalLeadStages: LEAD_STAGES,
    canonicalMessengerLeadRows: () => rows, canonicalLeadRow: (id: string) => rows.find(row => row.id === id),
    fetchCanonicalLeads: async () => {}, callrailRecentCallsHtml: () => "", LEAD_SOURCES: {},
    existingClientByContact: () => null, academyEsc: (s: unknown) => String(s).replaceAll("<", "&lt;"), jsQuote: String,
    fmtDateTime: () => "fixture date", render: () => {}, alert: () => {}, prompt: () => "Outside service area",
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: { lead_id: "active" } }) }; },
  });
  vm.runInContext(["leadStageControlsHtml", "renderLeadsView", "changeCanonicalLeadStage", "setCanonicalLeadStatus"].map(fn).join("\n"), context);
  return { context, calls, rows };
}

test("lead inbox filters retain closed enquiries and open an existing project", () => {
  const { context } = fixture();
  let html = context.renderLeadsView();
  assert.match(html, /Active fixture/);
  assert.doesNotMatch(html, /Rejected fixture/);
  context.state.leadStageFilter = "all";
  html = context.renderLeadsView();
  assert.match(html, /Rejected fixture/);
  context.db.orders.push({ id: "project-1", canonicalLeadId: "active" });
  assert.match(context.renderLeadsView(), /openOrder\('project-1'\)/);
  context.db.orders = [];
  context.db.archivedOrders = [{ id: "archived-1", canonicalLeadId: "active" }];
  assert.match(context.renderLeadsView(), /Проект в архиве/);
  assert.doesNotMatch(context.renderLeadsView(), /convertLead\('active'\)/);
  context.state.leadStageFilter = "DISQUALIFIED";
  assert.doesNotMatch(context.renderLeadsView(), /Active fixture/);
});

test("stage control persists expected status and reason, while a cancelled reason changes nothing", async () => {
  const { context, calls } = fixture();
  await context.changeCanonicalLeadStage("active", "DISQUALIFIED");
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { pipeline_status_code: "DISQUALIFIED", expected_status_codes: ["QUALIFIED"], stage_reason: "Outside service area" });
  context.prompt = () => null;
  await context.changeCanonicalLeadStage("active", "SPAM");
  assert.equal(calls.length, 1);
  assert.match(context.leadStageControlsHtml({ id: "sale", name: "Sale", stageCode: "CLOSED_WON", stageName: "Converted", stageLocked: true }), /disabled/);
});

test("an interrupted saved-project conversion completes its reservation without creating another claim", async () => {
  const { context } = fixture();
  const actions: string[] = [];
  context.canonicalLeads = [{ lead_id: "active" }];
  context.claimCanonicalLead = async (_: string, action: string) => { actions.push(action); return { ok: true }; };
  vm.runInContext(fn("closeCanonicalLead"), context);
  assert.equal((await context.closeCanonicalLead("active")).ok, true);
  assert.deepEqual(actions, ["complete"]);
  assert.equal(context.canonicalLeads.length, 0);
});
