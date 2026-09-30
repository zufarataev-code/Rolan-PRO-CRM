import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Behaviour test of the owner pay rules in the legacy CRM (decided
 * 2026-09-30, applied from 2026-09-01): the deal difficulty coefficient
 * multiplies installer pay, and each Smart zone pays the zone rate.
 */
const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const pick = (name: string) => {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} not found`);
  return match[0];
};

function load(db: unknown, windows: Array<{ win: Record<string, unknown> }>) {
  const constant = source.match(/const OWNER_PAY_RULES_FROM = '[^']+';/)?.[0] ?? "";
  const body = [
    constant,
    pick("orderUsesOwnerPayRules"),
    pick("orderPayComplexityCoef"),
    pick("orderSmartZoneCount"),
    pick("orderSmartZonePayout"),
    "return { orderUsesOwnerPayRules, orderPayComplexityCoef, orderSmartZoneCount, orderSmartZonePayout };",
  ].join("\n");
  return new Function("db", "measureAllWindows", "orderMeasureScope", body)(
    db,
    () => windows,
    () => "smart_film",
  ) as {
    orderUsesOwnerPayRules: (o: object) => boolean;
    orderPayComplexityCoef: (o: object) => number;
    orderSmartZoneCount: (o: object) => number;
    orderSmartZonePayout: (o: object, user: unknown, installers?: number) => number;
  };
}

const db = {
  settings: {
    complexityCoefs: { standard: 1, ladder: 1.2, tower: 1.5, alpinism: 2 },
    installerRates: { smartZone: 50 },
  },
};

test("difficulty multiplies installer pay from 2026-09-01 only", () => {
  const rules = load(db, []);
  assert.equal(rules.orderPayComplexityCoef({ complexity: "tower", installationDoneAt: "2026-09-12T10:00:00Z" }), 1.5);
  assert.equal(rules.orderPayComplexityCoef({ complexity: "alpinism", installationAt: "2026-09-01T08:00:00Z" }), 2);
  assert.equal(
    rules.orderPayComplexityCoef({ complexity: "tower", installationDoneAt: "2026-08-31T20:00:00Z" }),
    1,
    "August installations keep the rules they were paid under",
  );
});

test("each Smart zone pays $50, split between installers, never twice", () => {
  const windows = [
    { win: { measureScope: "smart_film", smart: { zones: [{}, {}] } } },
    { win: { measureScope: "smart_film", smart: { zones: [{}] } } },
    { win: { measureScope: "solar_film" } },
  ];
  const rules = load(db, windows);
  const order = { installationAt: "2026-09-20", extraServices: [] };
  assert.equal(rules.orderSmartZoneCount(order), 3);
  assert.equal(rules.orderSmartZonePayout(order, null, 1), 150);
  assert.equal(rules.orderSmartZonePayout(order, null, 2), 75);
  assert.equal(
    rules.orderSmartZonePayout({ ...order, extraServices: [{ type: "connect", qty: 3 }] }, null, 1),
    0,
    "a manual connection line already pays zones",
  );
  assert.equal(rules.orderSmartZonePayout({ ...order, installationAt: "2026-08-15" }, null, 1), 0);
});

test("the one-time rate directory sets the owner's values", () => {
  assert.match(source, /s\.complexityCoefs = \{ standard: 1\.0, ladder: 1\.2, tower: 1\.5, alpinism: 2\.0 \}/);
  assert.match(source, /smart: 5, protective: 3, solar: 2\.5, decorative: 2\.5/);
  assert.match(source, /s\.installerRates\.smartZone = 50/);
});
