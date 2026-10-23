import assert from "node:assert/strict";
import test from "node:test";

import { cuttingPlanForOpenings, openingToPanels, sashLayoutFor } from "./openings";

test("double-sash opening becomes two panes with numbered labels", () => {
  const panels = openingToPanels({ key: "К1", width_in: 72, height_in: 48, quantity: 1, sash_layout_code: "double_sash" });
  assert.equal(panels.length, 2);
  assert.equal(panels[0].glassWidthIn, 36);
  assert.equal(panels[0].glassHeightIn, 48);
  assert.deepEqual(panels.map((panel) => panel.id), ["К1.1", "К1.2"]);
});

test("french grid splits into cols × rows × quantity panes and custom grid overrides the preset", () => {
  assert.deepEqual(sashLayoutFor("french_grid"), { cols: 2, rows: 3 });
  assert.deepEqual(sashLayoutFor("french_grid", { cols: 3, rows: 4 }), { cols: 3, rows: 4 });
  const panels = openingToPanels({ key: "Г1", width_in: 48, height_in: 72, quantity: 2, sash_layout_code: "french_grid" });
  assert.equal(panels.length, 12);
  assert.equal(panels[0].glassWidthIn, 24);
  assert.equal(panels[0].glassHeightIn, 24);
});

test("glass versus film: cutting plan reports more film than glass and no unfit pieces for ordinary windows", () => {
  const plan = cuttingPlanForOpenings(
    [
      { key: "Г1", room_name: "Гостиная", width_in: 72, height_in: 60, quantity: 2, sash_layout_code: "panoramic" },
      { key: "Г2", room_name: "Гостиная", width_in: 32, height_in: 80, quantity: 1, sash_layout_code: "door" },
      { key: "К1", room_name: "Кухня", width_in: 72, height_in: 48, quantity: 2, sash_layout_code: "double_sash" },
      { key: "С1", room_name: "Спальня", width_in: 36, height_in: 48, quantity: 2 },
    ],
    { overlapIn: 1, rollWidthsIn: [36, 48, 60, 72] },
  );
  assert.ok(plan);
  assert.ok(Math.abs(plan.summary.glassSqft - 150) < 0.5);
  assert.ok(plan.summary.materialConsumptionSqft > plan.summary.glassSqft);
  assert.equal(plan.summary.unfitCount, 0);
  assert.ok(plan.summary.wastePercent > 0);
});

test("empty or invalid openings give no plan instead of throwing", () => {
  assert.equal(cuttingPlanForOpenings([]), null);
  assert.equal(cuttingPlanForOpenings([{ key: "x", width_in: 0, height_in: 48 }]), null);
});
