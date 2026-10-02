import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function slice(startMarker: string, endMarker: string) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `${startMarker} not found`);
  return html.slice(start, end);
}

const CATEGORY_ALIASES: Record<string, string> = { solar_film: "solar", "солнцезащитная": "solar", smart_film: "smart" };

type Fetch = (url: string, init: { body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function load(fields: Record<string, string>, { cloud = false, fetch }: { cloud?: boolean; fetch?: Fetch } = {}) {
  const db = {
    settings: {
      catalog: [
        { id: "film_titan", category: "solar_film", brand: "Rolan PRO", model: "Titan Prime™" },
        { id: "film_manual", category: "solar", brand: "", model: "Huper Ceramic 40", productName: "Huper Ceramic 40", pendingPurchase: true, addedManuallyAt: "2026-10-01T10:00:00Z" },
      ] as Array<Record<string, unknown>>,
      filmRolls: { defaultWidth: 1524 },
    },
    inventory: [{ id: "inv_old", catalogId: "film_titan", rollCode: "RP-2610-0007" }] as Array<Record<string, unknown>>,
    purchaseRequests: [
      { id: "pr_1", status: "ordered", orderId: "o1", itemId: "film_titan" },
      { id: "pr_2", status: "ordered", orderId: "o1", itemId: "film_manual" },
    ] as Array<Record<string, unknown>>,
    orders: [{ id: "o1", extraServices: [{ id: "l1", quickProjectLine: true, catalogId: "film_manual", label: "Huper Ceramic 40" }] }],
    vendors: [],
  };
  const movements: Array<Record<string, unknown>> = [];
  const context = vm.createContext({
    db,
    state: {},
    ROLANPRO_CLOUD: cloud,
    fetch: fetch ?? (() => Promise.reject(new Error("no network in file mode"))),
    SOLAR_FILM_SUBTYPES: ["Зеркальная", "Керамическая"],
    document: { getElementById: (id: string) => (id in fields ? { value: fields[id] } : null) },
    mm2_to_sqft: (mm2: number) => (mm2 / 1_000_000) * 10.7639,
    canonicalCatalogCategory: (value: string) => { const key = String(value || "").trim().toLowerCase(); return CATEGORY_ALIASES[key] || key; },
    catalogByCategory: () => ({ solar_film: [], solar: [] }),
    projectQuickLines: (o: { extraServices?: Array<{ quickProjectLine?: boolean }> }) => (o?.extraServices || []).filter((line) => line.quickProjectLine === true),
    catLabel: (key: string) => key,
    getCatalogItem: (id: string) => db.settings.catalog.find((item) => item.id === id),
    currentUser: () => ({ id: "u_o1", role: "owner" }),
    catalogLabel: (item: { brand?: string; model?: string }) => [item.brand, item.model].filter(Boolean).join(" "),
    recordInventoryMovement: (movement: Record<string, unknown>) => movements.push(movement),
    save: () => undefined,
    closeModal: () => undefined,
    render: () => undefined,
    cloudStatus: () => undefined,
    alert: (message: string) => { throw new Error(message); },
    uid: (() => { let n = 0; return () => `u${++n}`; })(),
  });
  const addInventoryRoll = slice("function addInventoryRoll(data) {", "function inventoryByCatalogId(");
  vm.runInContext(`${addInventoryRoll}\n${slice("// ---------- ПРИЁМ РУЛОНА НА СКЛАД", "function openFilmIssueModal(id){")}; Object.assign(this, { nextRollCode, rollCostPerSqft, confirmAddRoll, rollReceiptSuggestions });`, context);
  return {
    context: context as unknown as {
      nextRollCode: (d: string) => string;
      rollCostPerSqft: (c: number, l: number, w: number) => number;
      confirmAddRoll: () => Promise<void>;
      rollReceiptSuggestions: (category: string) => { brands: string[]; models: string[] };
    },
    db,
    movements,
  };
}

const RECEIPT = { "ar-form": "form-1", "ar-category": "solar", "ar-type": "", "ar-width": "1524", "ar-len": "30", "ar-cost": "500", "ar-date": "2026-10-02", "ar-lot": "L1", "ar-loc": "Warehouse", "ar-vendor": "", "ar-request": "", "ar-preset": "" };
const lastRoll = (db: { inventory: Array<Record<string, unknown>> }) => db.inventory.at(-1) as Record<string, unknown>;

test("each roll gets the next readable code for its month", () => {
  const { context } = load({});
  assert.equal(context.nextRollCode("2026-10-02"), "RP-2610-0008");
  assert.equal(context.nextRollCode("2026-11-01"), "RP-2611-0001");
});

test("the purchase price per sq ft is the roll price over the roll area, for every receipt", () => {
  const { context } = load({});
  // 1.524 m × 30 m = 45.72 m² = 492.13 sq ft; $500 / 492.13 = $1.016 / sq ft
  assert.equal(context.rollCostPerSqft(500, 30, 1524).toFixed(3), "1.016");
  assert.equal(context.rollCostPerSqft(0, 30, 1524), 0);
  assert.match(html, /costPerSqft: rollCostPerSqft\(data\.costTotal, data\.originalLengthM, widthMm\),/);
});

test("in the cloud the roll code comes from the server; no code, no roll", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const ok = load({ ...RECEIPT, "ar-brand": "Rolan PRO", "ar-model": "Titan Prime™" }, {
    cloud: true,
    fetch: async (_url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ data: { code: "RP-2610-0011" } }) }; },
  });
  await ok.context.confirmAddRoll();
  assert.deepEqual(calls, [{ date: "2026-10-02", seen_max: 7 }], "the server never issues a code below the ones already used");
  assert.equal(lastRoll(ok.db).rollCode, "RP-2610-0011");

  const offline = load({ ...RECEIPT, "ar-brand": "Rolan PRO", "ar-model": "Titan Prime™" }, { cloud: true });
  await assert.rejects(offline.context.confirmAddRoll(), /Не удалось получить код рулона/);
  assert.equal(offline.db.inventory.length, 1, "nothing is received without a code");
});

test("a double click receives one roll", async () => {
  let release: () => void = () => undefined;
  const { context, db } = load({ ...RECEIPT, "ar-brand": "Rolan PRO", "ar-model": "Titan Prime™" }, {
    cloud: true,
    fetch: () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: async () => ({ data: { code: "RP-2610-0008" } }) }); }),
  });
  const first = context.confirmAddRoll();
  const second = context.confirmAddRoll();
  release();
  await Promise.all([first, second]);
  assert.equal(db.inventory.length, 2);
});

test("receiving an existing film keeps it, whatever spelling its category has; a typed-in film is added", async () => {
  const known = load({ ...RECEIPT, "ar-brand": "rolan pro", "ar-model": "titan prime™", "ar-request": "pr_1", "ar-preset": "film_titan" });
  await known.context.confirmAddRoll();
  assert.equal(lastRoll(known.db).catalogId, "film_titan");
  assert.equal(lastRoll(known.db).rollCode, "RP-2610-0008");
  assert.equal(Number(lastRoll(known.db).costPerSqft).toFixed(3), "1.016");
  assert.equal(known.db.settings.catalog.length, 2);
  assert.equal(known.db.purchaseRequests[0].status, "received");
  assert.equal(known.movements[0].orderId, "o1", "the receipt is linked to the project of the purchase");
  assert.deepEqual([...known.context.rollReceiptSuggestions("solar").brands], ["Rolan PRO"], "«solar_film» films are suggested under solar");

  const fresh = load({ ...RECEIPT, "ar-type": "Керамическая", "ar-brand": "3M", "ar-model": "Ceramic 70", "ar-cost": "650" });
  await fresh.context.confirmAddRoll();
  assert.equal(fresh.db.settings.catalog.length, 3);
  const added = fresh.db.settings.catalog[2];
  assert.deepEqual([added.brand, added.model, added.filmCategory, added.category], ["3M", "Ceramic 70", "Керамическая", "solar"]);
  assert.equal(lastRoll(fresh.db).catalogId, added.id);
});

test("a roll ordered for a film written in by hand goes into that film, so the project gets its cost", async () => {
  const { context, db } = load({ ...RECEIPT, "ar-type": "Керамическая", "ar-brand": "Huper Optik", "ar-model": "Ceramic 40", "ar-request": "pr_2", "ar-preset": "film_manual" });
  await context.confirmAddRoll();
  assert.equal(db.settings.catalog.length, 2, "no duplicate film");
  const film = db.settings.catalog[1];
  assert.equal(lastRoll(db).catalogId, "film_manual");
  assert.deepEqual([film.brand, film.model, film.filmCategory, film.pendingPurchase], ["Huper Optik", "Ceramic 40", "Керамическая", false]);
  assert.equal(db.orders[0].extraServices[0].label, "Huper Optik Ceramic 40", "the project line shows the real film");
  assert.equal(db.purchaseRequests[1].status, "received");
});

test("brand, model, length and purchase price are required", async () => {
  await assert.rejects(load({ ...RECEIPT, "ar-brand": "", "ar-model": "X" }).context.confirmAddRoll(), /бренд и модель/);
  await assert.rejects(load({ ...RECEIPT, "ar-brand": "B", "ar-model": "X", "ar-cost": "0" }).context.confirmAddRoll(), /цену закупки/);
});

test("every way of receiving a roll reserves its code; the roll table shows code and price per sq ft", () => {
  assert.equal(html.match(/rollCode = await reserveRollCodeOnce\(dateReceived\)/g)?.length, 3);
  assert.equal(html.match(/location: 'Warehouse', rollCode \}\);/g)?.length, 2);
  assert.match(html, /<th class="text-left p-2">Код<\/th><th class="text-left p-2">Lot #<\/th>/);
  assert.match(html, /<th class="text-left p-2">Закупка \/ sq ft<\/th>/);
  assert.match(html, /rollCode: data\.rollCode \|\| '',\n    qrCode: data\.rollCode \|\| \('RP-ROLL-' \+ uid\(\)\),/);
});

test("a form closed or reopened while the code is reserved receives nothing", async () => {
  let release: () => void = () => undefined;
  const fields: Record<string, string> = { ...RECEIPT, "ar-brand": "Rolan PRO", "ar-model": "Titan Prime™" };
  const { context, db } = load(fields, {
    cloud: true,
    fetch: () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: async () => ({ data: { code: "RP-2610-0008" } }) }); }),
  });
  const pending = context.confirmAddRoll();
  fields["ar-form"] = "form-2"; // closed and opened again
  release();
  await pending;
  assert.equal(db.inventory.length, 1, "no roll from the closed form");
  assert.equal(db.purchaseRequests[0].status, "ordered");
  assert.equal(html.match(/rollReceiptFormStillOpen\('(ar|qf|mrf)-form', formToken\)/g)?.length, 3, "all three receipt paths check their form");
});
