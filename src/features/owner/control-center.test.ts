import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  envStatus,
  relativeAge,
  serverStatus,
  SERVICES,
  sortByUrgency,
  summarizeStatuses,
} from "./control-center-core";

test("control center registry has unique ids and never stores secrets", () => {
  const ids = SERVICES.map((service) => service.id);
  assert.equal(new Set(ids).size, ids.length);
  const text = JSON.stringify(SERVICES);
  assert.doesNotMatch(text, /sk_live|sk_test|token=|password|AKIA|-----BEGIN/i);
  for (const service of SERVICES) assert.ok(service.check || service.manual, `${service.id} needs a check or a manual status`);
});

test("every registered live check exists on the server side", () => {
  const source = readFileSync("src/features/owner/control-center.ts", "utf8");
  for (const service of SERVICES.filter((item) => item.check)) {
    assert.match(source, new RegExp(`\\b${service.check}\\b`), `missing check ${service.check}`);
  }
});

test("statuses summarize to the worst one and broken services come first", () => {
  const summary = summarizeStatuses(["ok", "warn", "ok", "down"]);
  assert.equal(summary.worst, "down");
  assert.deepEqual(summary.counts, { ok: 2, warn: 1, down: 1, unknown: 0 });
  const sorted = sortByUrgency([
    { id: "a", result: { status: "ok" as const, detail: "" } },
    { id: "b", result: { status: "down" as const, detail: "" } },
    { id: "c", result: { status: "warn" as const, detail: "" } },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["b", "c", "a"]);
});

test("server pressure thresholds", () => {
  assert.equal(serverStatus({ diskUsedPct: 40, memUsedPct: 60, loadPerCpu: 0.3 }), "ok");
  assert.equal(serverStatus({ diskUsedPct: 88, memUsedPct: 60, loadPerCpu: 0.3 }), "warn");
  assert.equal(serverStatus({ diskUsedPct: 40, memUsedPct: 60, loadPerCpu: 2 }), "warn");
  assert.equal(serverStatus({ diskUsedPct: 96, memUsedPct: 60, loadPerCpu: 0.3 }), "down");
});

test("human-readable ages and env status", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  assert.equal(relativeAge(null, now), "ни разу");
  assert.equal(relativeAge(new Date("2026-11-08T11:45:00Z"), now), "15 мин назад");
  assert.equal(relativeAge(new Date("2026-11-08T07:00:00Z"), now), "5 ч назад");
  assert.equal(relativeAge(new Date("2026-11-05T12:00:00Z"), now), "3 дн назад");
  assert.equal(envStatus(false, "Stripe").status, "down");
});

test("owner sees the control center link in the working CRM", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(html, /href="\/owner\/control-center"/);
});

test("cached project numbers are flagged as not live when the database fails", () => {
  const source = readFileSync("src/features/owner/control-center.ts", "utf8");
  assert.match(source, /staleError: message/);
  // A missing workspace row must not look like a healthy empty business.
  assert.match(source, /if \(!rows\[0\]\) throw new Error\("workspace_not_initialized"\)/);
  const page = readFileSync("app/owner/control-center/page.tsx", "utf8");
  assert.match(page, /Цифры по проектам не живые/);
});
