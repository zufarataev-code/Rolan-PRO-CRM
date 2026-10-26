import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function topLevelFunction(name: string) {
  const source = legacyCrm.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
  assert.ok(source, `${name} must exist`);
  return source;
}

test("Smart technical quantities reuse cashier lines and preserve unrelated manual rows", () => {
  const build = new Function(`
    let desiredNow = [];
    let seq = 0;
    const projectServiceProgress = () => ({ status: 'planned' });
    const serviceOfferingUnit = offering => offering.unit;
    const smartCashierDesiredLines = () => desiredNow;
    const projectOfferingLine = (offering, qty, serviceType) => ({
      id: 'new-' + (++seq), offeringId: offering.id, offeringName: offering.name,
      label: offering.name, unit: offering.unit, unitPrice: offering.pricePerSqft,
      qty, price: offering.pricePerSqft * qty, serviceType,
    });
    ${topLevelFunction("syncSmartCashierServices")}
    return { syncSmartCashierServices, setDesired(value) { desiredNow = value; } };
  `);
  const harness = build();
  const zone = { id: "zone", name: "Подключение зоны", unit: "zone", pricePerSqft: 100 };
  const power = { id: "power", name: "Установка блока питания", unit: "piece", pricePerSqft: 600 };
  const order = {
    serviceType: "smart_film",
    serviceTypes: ["smart_film"],
    offeringIds: [],
    offeringUnits: {},
    extraServices: [
      { id: "old-zone", offeringId: "zone", offeringName: zone.name, label: zone.name, unit: "zone", unitPrice: 100, qty: 1, price: 100, serviceType: "smart_film" },
      { id: "manual", type: "custom", label: "Parking permit", qty: 1, price: 50 },
    ],
  };

  harness.setDesired([
    { key: "zone:zone", role: "zone", offering: zone, qty: 4, roomIds: ["living"], capacities: [] },
    { key: "power:power", role: "power", offering: power, qty: 1, roomIds: ["living"], capacities: [100] },
  ]);
  assert.equal(harness.syncSmartCashierServices(order), true);
  assert.equal(order.extraServices.length, 3);
  const zoneLine = order.extraServices.find((line: { offeringId?: string }) => line.offeringId === "zone");
  assert.equal(zoneLine.id, "old-zone", "the existing cashier row is migrated, not duplicated");
  assert.equal(zoneLine.qty, 4);
  assert.equal(zoneLine.price, 400);
  assert.equal(zoneLine.smartAuto, true);
  assert.equal(order.extraServices.find((line: { id: string }) => line.id === "manual")?.price, 50);
  assert.equal(harness.syncSmartCashierServices(order), false, "a second sync is idempotent");

  harness.setDesired([]);
  assert.equal(harness.syncSmartCashierServices(order), true);
  assert.deepEqual(order.extraServices.map((line: { id: string }) => line.id), ["manual"]);
});

