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
    pick("smartZoneRate"),
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
    installerRates: { serviceTypes: { ZONE_CONNECTION: 50 } },
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
  assert.equal(
    rules.orderSmartZonePayout(order, { payConfig: { ratesByWorkType: { connect: 60 } } }, 1),
    180,
    "the employee's own connection rate wins",
  );
});

test("older imports without a zone list count the window quantity", () => {
  const rules = load(db, [{ win: { measureScope: "smart_film", qty: 3, smart: {} } }]);
  assert.equal(rules.orderSmartZoneCount({}), 3);
});

test("manual zone rows use the zone rate only for installations from 2026-09-01", () => {
  const rate = source.match(/function installerAdditionalWorkRate\(user, type, o = null\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(rate, /type === 'connect' && o && orderUsesOwnerPayRules\(o\)\) return smartZoneRate\(user\)/);
  assert.doesNotMatch(source, /s\.installerRates\.workTypes\.connect = 50/, "no retroactive change for older rows");
});

test("the one-time rate directory sets the owner's values", () => {
  assert.match(source, /s\.complexityCoefs = \{ standard: 1\.0, ladder: 1\.2, tower: 1\.5, alpinism: 2\.0 \}/);
  assert.match(source, /smart: 5, protective: 3, solar: 2\.5, decorative: 2\.5/);
  assert.match(source, /s\.installerRates\.serviceTypes\.ZONE_CONNECTION = 50/);
});

test("difficulty multiplies film, zone and add-on labor alike", () => {
  const payout = source.match(/function orderInstallerPayoutForUser\(o, userId\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(
    payout,
    /\(filmPayout\s*\+ orderSmartZonePayout\(o, user, installerIds\.length\)\s*\+ orderAdditionalWorkPayoutForUser\(o, user, installerIds\.length\)\) \* orderPayComplexityCoef\(o\)/,
  );
});

test("the difficulty coefficient also multiplies add-on revenue (whole deal)", () => {
  const revenue = source.match(/function orderExtraServicesRevenue\(o\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(revenue, /return base \* orderPayComplexityCoef\(o\)/);
  // The old settings editor is read-only; the rate directory is the only source.
  assert.match(source, /value="\$\{s\.complexityCoefs\[k\]\}" disabled title="Меняется в «Сотрудники → Расценки»"/);
});

test("a new installer without personal rates is paid from the rate directory", () => {
  const block = source.match(/\/\/ ---- USER PAY CONFIG migration ----[\s\S]*?u\.payConfig\.ratesByWorkType = u\.payConfig\.ratesByWorkType \|\| \{\};/)?.[0] || "";
  assert.match(block, /ratePerSqft: 0,/);
  assert.match(block, /ratesByCategory: \{\},/);
  assert.doesNotMatch(block, /smart: 0\.55/);
});

test("team lead earns own pay plus 10% of each group installer (owner's example)", () => {
  // $500 job, lead L and installer I (in L's group) → $250 each; L gets $250 + $25.
  const users: Record<string, Record<string, unknown>> = {
    L: { id: "L", installerLead: true },
    I: { id: "I", groupLeadId: "L" },
    X: { id: "X" },
  };
  const constant = source.match(/const OWNER_PAY_RULES_FROM = '[^']+';/)?.[0] ?? "";
  const leadConst = source.match(/const INSTALLER_LEAD_OVERRIDE_PCT = \d+;/)?.[0] ?? "";
  const body = [
    constant,
    leadConst,
    pick("orderUsesOwnerPayRules"),
    pick("orderLeadOverrideForUser"),
    pick("orderGroupLeadIds"),
    "return { orderLeadOverrideForUser, orderGroupLeadIds };",
  ].join("\n");
  const lead = new Function("getUser", "orderInstallerPayoutForUser", body)(
    (id: string) => users[id],
    () => 250,
  ) as { orderLeadOverrideForUser: (o: object, id: string) => number; orderGroupLeadIds: (o: object) => string[] };

  const job = { installerIds: ["L", "I"], installationDoneAt: "2026-09-20" };
  assert.equal(lead.orderLeadOverrideForUser(job, "L"), 25, "10% of the group installer's $250");
  assert.equal(250 + lead.orderLeadOverrideForUser(job, "L"), 275);
  assert.deepEqual(lead.orderGroupLeadIds(job), ["L"]);

  // The lead is not on the job but leads the installer: still 10%.
  assert.equal(lead.orderLeadOverrideForUser({ installerIds: ["I"], installationDoneAt: "2026-09-20" }, "L"), 25);
  // An installer outside the group earns the lead nothing.
  assert.equal(lead.orderLeadOverrideForUser({ installerIds: ["L", "X"], installationDoneAt: "2026-09-20" }, "L"), 0);
  // Before 2026-09-01 the rule does not apply.
  assert.equal(lead.orderLeadOverrideForUser({ installerIds: ["L", "I"], installationDoneAt: "2026-08-20" }, "L"), 0);
});
