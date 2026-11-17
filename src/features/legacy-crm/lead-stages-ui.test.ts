import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { LEAD_STAGES } from "../sales/lead-stages";
import { OPEN_LEAD_STATUS_CODES } from "../sales/lead-claim";

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
    db: { settings: {}, orders: [] }, state: {}, canonicalLeadsRefreshedAt: Date.now(), canonicalLeadsRefreshFailed: false, canonicalLeadStages: LEAD_STAGES,
    CANONICAL_OPEN_LEAD_STATUSES: new Set(OPEN_LEAD_STATUS_CODES),
    canonicalMessengerLeadRows: () => rows, canonicalLeadRow: (id: string) => rows.find(row => row.id === id),
    fetchCanonicalLeads: async () => {}, callrailRecentCallsHtml: () => "", LEAD_SOURCES: {},
    existingClientByContact: () => null, academyEsc: (s: unknown) => String(s).replaceAll("<", "&lt;"), jsQuote: String,
    fmtDateTime: () => "fixture date", render: () => {}, alert: () => {}, prompt: () => "Outside service area",
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: { lead_id: "active" } }) }; },
  });
  vm.runInContext(["leadDeliveryHtml", "leadStageControlsHtml", "renderLeadsView", "changeCanonicalLeadStage", "setCanonicalLeadStatus"].map(fn).join("\n"), context);
  return { context, calls, rows };
}

test("inbox shows each provider's recorded state and distinguishes validation, live receipts, and missing data", () => {
  const { context, rows } = fixture();
  const row = (event_name: string, processing_status: string) => ({ event_name, processing_status, updated_at: "2026-11-17T12:00:00Z" });
  Object.assign(rows[0], { delivery: {
    facebook: [row("<Lead>", "test_accepted"), row("QualifiedLead", "queued")],
    google: [row("qualified_lead", "submitted"), row("converted_lead", "confirmed"), row("RESTATEMENT", "validated")],
  } });
  const html = context.renderLeadsView();
  for (const label of ["Facebook CAPI", "&lt;Lead>", "Только тест · принято Facebook", "В очереди", "Google Ads", "Отправлено", "Обработка подтверждена Google", "Только тест · проверено Google"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /<Lead>/);
  assert.match(context.leadDeliveryHtml({ facebook: [], google: [] }), /Нет записи об отправке/);
  assert.match(context.leadDeliveryHtml(undefined), /Нет данных CRM/);
  assert.match(context.leadDeliveryHtml({ facebook: [row("Lead", "new_state")] }), /Статус неизвестен/);
  context.canonicalLeadsRefreshFailed = true;
  assert.match(context.renderLeadsView(), /Не удалось обновить/);
});

test("lead inbox filters retain closed enquiries and open an existing project", () => {
  const { context, rows } = fixture();
  let html = context.renderLeadsView();
  assert.match(html, /Active fixture/);
  assert.doesNotMatch(html, /Rejected fixture/);
  context.state.leadStageFilter = "all";
  html = context.renderLeadsView();
  assert.match(html, /Rejected fixture/);
  context.db.orders.push({ id: "project-1", canonicalLeadId: "active" });
  assert.match(context.renderLeadsView(), /convertLead\('active'\)/);
  rows[0].statusCode = rows[0].stageCode = "PROJECT_CREATED";
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

test("the inbox action retries an interrupted saved-project conversion without matching clients or claiming again", async () => {
  const { context } = fixture();
  const actions: string[] = [];
  context.db.orders.push({ id: "saved-project", canonicalLeadId: "active" });
  context.canonicalLeads = [{ lead_id: "active" }];
  context.claimCanonicalLead = async (_: string, action: string) => { actions.push(action); return { ok: true }; };
  context.openOrder = (id: string) => actions.push(`open:${id}`);
  context.clientsMatchingContact = () => { throw new Error("saved projects need no client selection"); };
  vm.runInContext(`const convertingLeadIds = new Set();\n${["closeCanonicalLead", "convertLead", "convertLeadOnce"].map(fn).join("\n")}`, context);
  const action = context.renderLeadsView().match(/onclick="(convertLead\('active'\))"/)?.[1];
  assert.ok(action, "a pending stage exposes completion retry through the real inbox button");
  await vm.runInContext(action, context);
  assert.deepEqual(actions, ["complete", "open:saved-project"]);
  assert.equal(context.db.orders.length, 1);
  assert.equal(context.canonicalLeads.length, 0);
});
