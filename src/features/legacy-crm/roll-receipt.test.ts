import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function block() {
  const start = html.indexOf("// ---------- ПРИЁМ РУЛОНА НА СКЛАД");
  const end = html.indexOf("function openFilmIssueModal(id){");
  assert.ok(start > 0 && end > start, "roll receipt block not found");
  return html.slice(start, end);
}

function load(fields: Record<string, string>) {
  const db = {
    settings: { catalog: [{ id: "film_titan", category: "solar", brand: "Rolan PRO", model: "Titan Prime™" }] as Array<Record<string, unknown>> },
    inventory: [{ id: "inv_old", rollCode: "RP-2610-0007" }] as Array<Record<string, unknown>>,
    purchaseRequests: [{ id: "pr_1", status: "ordered", orderId: "o1", itemId: "film_titan" }] as Array<Record<string, unknown>>,
    vendors: [],
  };
  const movements: Array<Record<string, unknown>> = [];
  const context = vm.createContext({
    db,
    state: {},
    SOLAR_FILM_SUBTYPES: ["Зеркальная", "Керамическая"],
    document: { getElementById: (id: string) => (id in fields ? { value: fields[id] } : null) },
    mm2_to_sqft: (mm2: number) => (mm2 / 1_000_000) * 10.7639,
    catalogByCategory: () => ({ solar: [] }),
    catLabel: (key: string) => key,
    getCatalogItem: (id: string) => db.settings.catalog.find((item) => item.id === id),
    currentUser: () => ({ id: "u_o1", role: "owner" }),
    catalogLabel: (item: { brand?: string; model?: string }) => `${item.brand} ${item.model}`,
    addInventoryRoll: (data: Record<string, unknown>) => { const roll = { id: "inv_new", ...data }; db.inventory.push(roll); return roll; },
    recordInventoryMovement: (movement: Record<string, unknown>) => movements.push(movement),
    save: () => undefined,
    closeModal: () => undefined,
    render: () => undefined,
    cloudStatus: () => undefined,
    fmtMoney: (value: number) => `$${value.toFixed(2)}`,
    alert: (message: string) => { throw new Error(message); },
    uid: () => "abc",
  });
  vm.runInContext(`${block()}; Object.assign(this, { nextRollCode, rollCostPerSqft, confirmAddRoll });`, context);
  return { context: context as unknown as { nextRollCode: (d: string) => string; rollCostPerSqft: (c: number, l: number, w: number) => number; confirmAddRoll: () => void }, db, movements };
}

test("each roll gets the next readable code for its month", () => {
  const { context } = load({});
  assert.equal(context.nextRollCode("2026-10-02"), "RP-2610-0008");
  assert.equal(context.nextRollCode("2026-11-01"), "RP-2611-0001");
});

test("the purchase price per sq ft is the roll price over the roll area", () => {
  const { context } = load({});
  // 1.524 m × 30 m = 45.72 m² = 492.13 sq ft; $500 / 492.13 = $1.016 / sq ft
  assert.equal(context.rollCostPerSqft(500, 30, 1524).toFixed(3), "1.016");
  assert.equal(context.rollCostPerSqft(0, 30, 1524), 0);
});

test("receiving an existing film keeps it; a typed-in film is added to the list", () => {
  const known = load({ "ar-category": "solar", "ar-type": "", "ar-brand": "rolan pro", "ar-model": "titan prime™", "ar-width": "1524", "ar-len": "30", "ar-cost": "500", "ar-date": "2026-10-02", "ar-lot": "L1", "ar-loc": "Warehouse", "ar-vendor": "", "ar-request": "pr_1" });
  known.context.confirmAddRoll();
  const roll = known.db.inventory.at(-1) as Record<string, unknown>;
  assert.equal(roll.catalogId, "film_titan");
  assert.equal(roll.rollCode, "RP-2610-0008");
  assert.equal(Number(roll.costPerSqft).toFixed(3), "1.016");
  assert.equal(known.db.settings.catalog.length, 1);
  assert.equal(known.db.purchaseRequests[0].status, "received");
  assert.equal(known.movements[0].orderId, "o1", "the receipt is linked to the project of the purchase");

  const fresh = load({ "ar-category": "solar", "ar-type": "Керамическая", "ar-brand": "Huper Optik", "ar-model": "Ceramic 40", "ar-width": "1524", "ar-len": "30", "ar-cost": "650", "ar-date": "2026-10-02", "ar-lot": "", "ar-loc": "", "ar-vendor": "", "ar-request": "" });
  fresh.context.confirmAddRoll();
  assert.equal(fresh.db.settings.catalog.length, 2);
  const added = fresh.db.settings.catalog[1];
  assert.equal(added.brand, "Huper Optik");
  assert.equal(added.model, "Ceramic 40");
  assert.equal(added.filmCategory, "Керамическая");
  assert.equal((fresh.db.inventory.at(-1) as Record<string, unknown>).catalogId, added.id);
});

test("brand, model, length and purchase price are required", () => {
  assert.throws(() => load({ "ar-category": "solar", "ar-brand": "", "ar-model": "X", "ar-len": "30", "ar-cost": "500" }).context.confirmAddRoll(), /бренд и модель/);
  assert.throws(() => load({ "ar-category": "solar", "ar-brand": "B", "ar-model": "X", "ar-len": "30", "ar-cost": "0" }).context.confirmAddRoll(), /цену закупки/);
});

test("the roll table shows the roll code and the purchase price per sq ft", () => {
  assert.match(html, /<th class="text-left p-2">Код<\/th><th class="text-left p-2">Lot #<\/th>/);
  assert.match(html, /<th class="text-left p-2">Закупка \/ sq ft<\/th>/);
  assert.match(html, /rollCode: data\.rollCode \|\| '',\n    qrCode: data\.rollCode \|\| \('RP-ROLL-' \+ uid\(\)\),/);
});
