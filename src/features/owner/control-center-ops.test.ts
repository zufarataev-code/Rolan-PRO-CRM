import assert from "node:assert/strict";
import test from "node:test";

import { agentForBranch, buildAgentBoard } from "./control-center-agents";
import { startOfLaDay, summarizeLegacyOrders } from "./control-center-ops";

const now = new Date("2026-11-08T12:00:00-08:00");
const day = 86_400_000;
const iso = (offsetDays: number) => new Date(now.getTime() + offsetDays * day).toISOString();

const payload = {
  clients: [
    { id: "c1", name: "Ortiz" },
    { id: "c2", name: "Avian Law" },
  ],
  orders: [
    { id: "o1", number: "101", clientId: "c1", status: "new", updatedAt: iso(-1) },
    { id: "o2", number: "102", clientId: "c2", status: "measurement_scheduled", updatedAt: iso(-2) },
    {
      id: "o3", clientId: "c1", status: "installation_scheduled", installationAt: iso(2),
      projectEstimateSnapshot: { revenue: 5000 }, payments: [{ amount: 1000, date: iso(-5) }],
    },
    // Accepted without a fixed estimate: counted separately, never guessed.
    { id: "o4", clientId: "c2", status: "proposal_accepted" },
    // Fully paid and done: no debt, not active.
    { id: "o5", clientId: "c1", status: "completed", projectEstimateSnapshot: { revenue: 2000 }, payments: [{ amount: 2000, date: iso(-40) }] },
    // Done but unpaid: still a debtor.
    { id: "o6", clientId: "c2", status: "completed", projectEstimateSnapshot: { revenue: 800 }, paid: 300 },
    // Cancelled and unconfirmed historical drafts are ignored.
    { id: "o7", clientId: "c1", status: "cancelled", projectEstimateSnapshot: { revenue: 9999 } },
    { id: "o8", clientId: "c1", status: "proposal_accepted", quickEntryDraft: true, projectEstimateSnapshot: { revenue: 7777 } },
    // Install far in the future is not in the 7-day list.
    { id: "o9", clientId: "c1", status: "installation_scheduled", installationAt: iso(20) },
    // Project date is the earliest service (yesterday); the next service is in 3 days.
    {
      id: "o10", clientId: "c2", status: "installation_in_progress", installationAt: iso(-1),
      serviceSchedules: [{ id: "s1", installationAt: iso(-1) }, { id: "s2", installationAt: iso(3) }],
    },
    // Older order: only a total with its date.
    { id: "o13", clientId: "c2", status: "completed", projectEstimateSnapshot: { revenue: 300 }, paid: 300, paidAt: iso(-2) },
    // Accepted proposal with a draft plan: not a confirmed install yet.
    { id: "o12", clientId: "c1", status: "proposal_accepted", serviceSchedules: [{ id: "s3", installationAt: iso(1) }] },
    // Stripe confirmed automatically: CRM bumps o.paid, no payments line.
    {
      id: "o11", clientId: "c1", status: "installation_scheduled", projectEstimateSnapshot: { revenue: 1000 },
      paid: 400, stripe: { paid: true, amount: 400, paidAt: iso(-3) },
    },
  ],
};

test("ops summary counts active projects by stage from the working CRM", () => {
  const ops = summarizeLegacyOrders(payload, now);
  assert.equal(ops.active, 8); // o1, o2, o3, o4, o9, o10, o11, o12
  const counts = Object.fromEntries(ops.stages.map((stage) => [stage.key, stage.count]));
  assert.deepEqual(counts, { lead: 1, survey: 1, proposal: 2, install: 4, closing: 0 });
  assert.equal(ops.stages[0].cards[0].client, "Ortiz");
  assert.equal(ops.stages[0].cards[0].link, "/legacy-crm#/order/o1");
});

test("receivables use only the approved estimate and skip cancelled or draft work", () => {
  const ops = summarizeLegacyOrders(payload, now);
  assert.equal(ops.receivable, 4000 + 500 + 600);
  assert.equal(ops.receivableCount, 3);
  assert.equal(ops.debtors[0].id, "o3");
  assert.equal(ops.withoutEstimate, 4); // o4, o9, o10, o12
  assert.equal(ops.received30, 1000 + 400 + 300); // payments line + automatic Stripe + legacy paid total
});

test("installs list holds only the next seven days, soonest first", () => {
  const ops = summarizeLegacyOrders(payload, now);
  assert.deepEqual(ops.installsNext7.map((card) => card.id), ["o3", "o10"]);
  assert.equal(ops.installsNext7[1].installAt, iso(3));
});

test("empty or broken payload never throws", () => {
  assert.equal(summarizeLegacyOrders(null, now).active, 0);
  assert.equal(summarizeLegacyOrders({ orders: "x" }, now).receivable, 0);
});

test("agent board groups open PRs by branch and flags stale and overlapping work", () => {
  assert.equal(agentForBranch("claude/control-center"), "Claude");
  assert.equal(agentForBranch("codex/payroll"), "Codex");
  assert.equal(agentForBranch("fix/stripe"), "Другие");
  const board = buildAgentBoard(
    [
      { number: 1, title: "A", head: { ref: "claude/a" }, updated_at: iso(-1), html_url: "u1", labels: [{ name: "conflict-risk" }] },
      { number: 2, title: "B", head: { ref: "codex/b" }, updated_at: iso(-30), html_url: "u2", labels: [{ name: "stale" }] },
      { number: 3, title: "C", head: { ref: "codex/c" }, updated_at: iso(-2), html_url: "u3", labels: [{ name: "owner" }] },
    ],
    now,
  );
  assert.equal(board.byAgent.Claude.length, 1);
  assert.deepEqual(board.byAgent.Codex.map((pr) => pr.number), [3, 2]);
  assert.equal(board.staleCount, 1);
  assert.equal(board.conflictCount, 1);
  assert.equal(board.ownerCount, 1);
});

test("once the radar has run, staleness comes from its commit-based label, not updated_at", () => {
  const board = buildAgentBoard(
    [
      // Old branch whose updated_at was bumped by a radar comment: still stale.
      { number: 4, title: "D", head: { ref: "codex/d" }, updated_at: iso(0), html_url: "u4", labels: [{ name: "stale" }] },
      // Fresh commits, quiet discussion: not stale.
      { number: 5, title: "E", head: { ref: "claude/e" }, updated_at: iso(-20), html_url: "u5", labels: [{ name: "conflict-risk" }] },
    ],
    now,
  );
  assert.equal(board.byAgent.Codex[0].stale, true);
  assert.equal(board.byAgent.Claude[0].stale, false);
});

test("before the radar's first run, staleness falls back to updated_at", () => {
  const board = buildAgentBoard([{ number: 6, title: "F", head: { ref: "codex/f" }, updated_at: iso(-30), html_url: "u6" }], now);
  assert.equal(board.staleCount, 1);
});

test("the day starts at midnight Los Angeles time whatever the server zone", () => {
  // 2026-11-08 03:00 UTC is still Nov 7, 19:00 in LA (PST, UTC-8).
  assert.equal(startOfLaDay(new Date("2026-11-08T03:00:00Z")).toISOString(), "2026-11-07T08:00:00.000Z");
  // Summer time: UTC-7.
  assert.equal(startOfLaDay(new Date("2026-07-01T20:00:00Z")).toISOString(), "2026-07-01T07:00:00.000Z");
  // DST switch days: the offset at midnight differs from the offset at noon.
  assert.equal(startOfLaDay(new Date("2026-03-08T20:00:00Z")).toISOString(), "2026-03-08T08:00:00.000Z");
  assert.equal(startOfLaDay(new Date("2026-11-01T20:00:00Z")).toISOString(), "2026-11-01T07:00:00.000Z");
});
