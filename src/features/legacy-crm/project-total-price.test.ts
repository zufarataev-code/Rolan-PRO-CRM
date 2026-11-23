import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

/** The owner types the project total and the film price per sqft follows (Owner, 2026-11-22, Zakaz #908). */
function sandbox(order: any) {
  const from = html.indexOf("function projectRevenueAtFlatPrice(o, perSqft) {");
  const to = html.indexOf("function projectEstimateUpdateSetting(oid, field, value) {");
  assert.ok(from > 0 && to > from);
  const calls: string[] = [];
  const context = vm.createContext({
    getOrder: () => order,
    currentUser: () => ({}),
    orderUserCanSeeMoney: () => true,
    fmtMoney: (n: number) => `$${n.toFixed(2)}`,
    alert: (text: string) => calls.push(`alert:${text}`),
    projectEstimateMarkChanged: (_o: unknown, text: string) => calls.push(text),
    save: () => calls.push("save"),
    refreshProjectEstimateWorkspace: () => calls.push("refresh"),
    // film: area × price (per-window price first), plus service lines
    orderRevenue: (o: any) =>
      (o.measurements.rooms as any[]).flatMap((r) => r.windows).reduce((sum, w) => sum + w.area * (w.pricePerSqft ?? o.priceOverridePerSqft ?? 10), 0) +
      (o.extraServices as any[]).reduce((sum, line) => sum + line.price, 0),
  });
  vm.runInContext(html.slice(from, to), context);
  return { ...(context as any), calls };
}
const order = () => ({
  priceOverridePerSqft: null,
  extraServices: [{ price: 200 }],
  measurements: { rooms: [{ windows: [{ area: 30, pricePerSqft: 15 }, { area: 70 }] }] },
});

test("a typed total sets one price per sqft for the film and keeps services", () => {
  const o: any = order();
  const { projectEstimateSetTotal, orderRevenue } = sandbox(o);
  projectEstimateSetTotal("908", "2,700");
  assert.equal(o.priceOverridePerSqft, 25);
  assert.equal(o.measurements.rooms[0].windows[0].pricePerSqft, null);
  assert.equal(orderRevenue(o), 2700);
});

test("a total below the services or a project without sizes is refused", () => {
  const o: any = order();
  const { projectEstimateSetTotal, calls } = sandbox(o);
  projectEstimateSetTotal("908", "150");
  assert.equal(o.priceOverridePerSqft, null);
  assert.ok(calls.some((text) => text.startsWith("alert:")));
  const empty: any = { ...order(), measurements: { rooms: [] } };
  const second = sandbox(empty);
  second.projectEstimateSetTotal("908", "900");
  assert.equal(empty.priceOverridePerSqft, null);
});
