import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agentOf, findOverlaps, MARKER, renderComment, renderStaleComment } from "../../../scripts/agents/conflict-radar.mjs";

const prs = [
  { number: 10, title: "Claude касса", branch: "claude/cashier", files: ["private/legacy/rolanpro-crm-cloud.html", "PROJECT_STATE.md", "src/a.ts"] },
  { number: 11, title: "Codex зарплата", branch: "codex/payroll", files: ["private/legacy/rolanpro-crm-cloud.html", "PROJECT_STATE.md"] },
  { number: 12, title: "Codex доки", branch: "codex/docs", files: ["PROJECT_STATE.md", "docs/x.md"] },
];

test("radar finds shared files both ways and marks the legacy CRM file as hot", () => {
  const overlaps = findOverlaps(prs);
  assert.equal(overlaps.get(10)?.length, 1);
  assert.equal(overlaps.get(11)?.[0].number, 10);
  assert.equal(overlaps.get(10)?.[0].hot, true);
});

test("handoff files every PR updates are not counted as conflicts", () => {
  assert.equal(findOverlaps(prs).get(12)?.length, 0);
});

test("comment names the other agent and is updatable via its marker", () => {
  const body = renderComment(findOverlaps(prs).get(10) ?? [], 3);
  assert.ok(body.startsWith(MARKER));
  assert.match(body, /#11 \(Codex/);
  assert.match(renderComment([], 3), /не пересекаются/);
  assert.equal(agentOf("claude/x"), "Claude");
  const stale = renderStaleComment();
  assert.ok(stale.startsWith(MARKER));
  assert.match(stale, /stale/);
});

test("radar workflow runs on PR updates and on a schedule with label-write rights only", () => {
  const workflow = readFileSync(".github/workflows/agent-conflict-radar.yml", "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /schedule:/);
  // A merged or closed PR must free its partner right away, not in six hours.
  assert.match(workflow, /types: \[[^\]]*closed[^\]]*\]/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
});
