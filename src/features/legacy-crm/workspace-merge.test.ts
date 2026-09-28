import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mergeWorkspaceSnapshots } from "./workspace-merge";

test("merges changes from two CRM tabs without losing either project", () => {
  const base = {
    orders: [
      { id: "order-a", status: "lead", notes: "" },
      { id: "order-b", status: "lead", notes: "" },
    ],
  };
  const local = {
    orders: [
      { id: "order-a", status: "consultation", notes: "" },
      { id: "order-b", status: "lead", notes: "" },
      { id: "order-c", status: "lead", notes: "new" },
    ],
  };
  const remote = {
    orders: [
      { id: "order-a", status: "lead", notes: "" },
      { id: "order-b", status: "measurement_scheduled", notes: "" },
      { id: "order-d", status: "lead", notes: "remote" },
    ],
  };

  const merged = mergeWorkspaceSnapshots(base, local, remote) as typeof base;

  assert.deepEqual(merged.orders.map((order) => order.id), ["order-a", "order-b", "order-d", "order-c"]);
  assert.equal(merged.orders.find((order) => order.id === "order-a")?.status, "consultation");
  assert.equal(merged.orders.find((order) => order.id === "order-b")?.status, "measurement_scheduled");
});

test("keeps append-only timeline events from both tabs", () => {
  const base = [{ at: "1", key: "created" }];
  const local = [...base, { at: "2", key: "measured" }];
  const remote = [...base, { at: "3", key: "paid" }];

  assert.deepEqual(mergeWorkspaceSnapshots(base, local, remote), [
    { at: "1", key: "created" },
    { at: "3", key: "paid" },
    { at: "2", key: "measured" },
  ]);
});

test("active tab wins only when both tabs edit the same scalar", () => {
  assert.equal(mergeWorkspaceSnapshots("lead", "consultation", "measurement"), "consultation");
});

test("legacy CRM resolves revision conflicts without alert or page reload", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

  assert.match(html, /mergeCloudWorkspaceSnapshots\(cloudBaseSnapshot, JSON\.parse\(JSON\.stringify\(db\)\), remotePayload\)/);
  assert.match(html, /cloudStatus\('Объединяем изменения…'\)/);
  assert.doesNotMatch(html, /Другой сотрудник уже изменил данные/);
  assert.doesNotMatch(html, /if \(response\.status === 409\)[\s\S]{0,400}location\.reload\(\)/);
});
