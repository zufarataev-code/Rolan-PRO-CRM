import assert from "node:assert/strict";
import test from "node:test";

import { filterLeads, leadFilters, leadRows, stageChoices, type ApiLead, type LeadStage } from "./leads";
import { LEAD_STAGES } from "../sales/lead-stages";

const stages = LEAD_STAGES as unknown as LeadStage[];
const now = Date.parse("2026-11-18T08:00:00Z");
const lead = (id: string, code: string, extra: Partial<ApiLead> = {}): ApiLead => ({
  lead_id: id, name: `Lead ${id}`, phone: "+13105550100", email: null, source: "website", notes: null,
  pipeline_status: { status_code: code, name_ru: code, is_closed: ["DISQUALIFIED", "CLOSED_LOST", "SPAM", "CLOSED_WON"].includes(code) },
  created_at: "2026-11-17T20:00:00Z", ...extra,
});
const rows = leadRows([
  lead("a", "NEW_LEAD", { notes: "Smart film for office", claimed_at: "2026-11-18T07:55:00Z" }),
  lead("b", "CONTACTED", { outcome_stage: "CLOSED_WON" }),
  lead("c", "SPAM", { stage_history: [{ occurred_at: "2026-11-17T21:00:00Z", pipeline_status_code: "SPAM", reason: "дубль" }] }),
  lead("d", "QUALIFIED", { source: "callrail", claimed_at: "2026-11-18T06:00:00Z" }),
  { ...lead("e", "NEW_LEAD"), pipeline_status: null },
], stages, now);

test("leads are arranged the way the working screen arranges them", () => {
  assert.deepEqual(rows.map((row) => row.id), ["a", "b", "c", "d"]);
  const [a, b, c, d] = rows;
  assert.equal(a.stageName, "Новый лид");
  assert.equal(a.beingConverted, true);
  assert.equal(d.beingConverted, false, "a reservation older than ten minutes is no longer shown");
  assert.deepEqual([b.statusCode, b.stageCode, b.stageClosed, b.stageLocked], ["CONTACTED", "CLOSED_WON", true, true]);
  assert.deepEqual(c.history, [{ at: "2026-11-17T21:00:00Z", stage: "Спам / дубль", reason: "дубль" }]);
  assert.equal(d.sourceLabel, "Звонок · CallRail");
});

test("filters: active, closed, one stage, and search", () => {
  assert.deepEqual(filterLeads(rows, "active", "").map((row) => row.id), ["a", "d"]);
  assert.deepEqual(filterLeads(rows, "closed", "").map((row) => row.id), ["b", "c"]);
  assert.deepEqual(filterLeads(rows, "QUALIFIED", "").map((row) => row.id), ["d"]);
  assert.deepEqual(filterLeads(rows, "active", "smart FILM").map((row) => row.id), ["a"]);
  assert.deepEqual(leadFilters(rows, stages).map((chip) => `${chip.id}:${chip.count}`), ["active:2", "NEW_LEAD:1", "QUALIFIED:1", "closed:2"]);
});

test("only manual stages can be chosen, plus the stage the lead is in", () => {
  const codes = stageChoices(rows[1], stages).map((choice) => choice.code);
  assert.ok(codes.includes("CLOSED_WON"));
  assert.ok(!codes.includes("PROPOSAL_SENT"));
  assert.deepEqual(stageChoices(rows[0], stages).map((choice) => choice.code), stages.filter((stage) => stage.manual).map((stage) => stage.code));
});
