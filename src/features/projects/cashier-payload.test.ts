import assert from "node:assert/strict";
import test from "node:test";

import { parseCashierInput } from "./cashier-payload";

test("parses a cashier payload with directions and openings", () => {
  const parsed = parseCashierInput({
    directions: [{ direction_code: "SOLAR_FILM", film_id: "f1", price_per_sqft: "6.5", addon_codes: ["EXTERIOR"], film_class: "standard" }],
    openings: [{ key: "Г1", room_name: "Гостиная", width_in: "72", height_in: 60, quantity: 2, access_code: "tower", removal_required: true, sash_layout_code: "panoramic" }],
  });
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.input.directions[0].price_per_sqft, 6.5);
  assert.equal(parsed.input.openings[0].width_in, 72);
  // Окно без направлений уходит на первое (основное) направление.
  assert.deepEqual(parsed.input.openings[0].direction_codes, ["SOLAR_FILM"]);
});

test("rejects unknown direction, duplicate direction and bad sizes", () => {
  const unknown = parseCashierInput({ directions: [{ direction_code: "LASER" }], openings: [] });
  assert.equal(unknown.ok, false);
  const dup = parseCashierInput({ directions: [{ direction_code: "SOLAR_FILM" }, { direction_code: "SOLAR_FILM" }], openings: [] });
  assert.equal(dup.ok, false);
  const bad = parseCashierInput({ directions: [{ direction_code: "SOLAR_FILM" }], openings: [{ width_in: 0, height_in: 48 }] });
  assert.equal(bad.ok, false);
  const huge = parseCashierInput({ directions: [{ direction_code: "SOLAR_FILM" }], openings: [{ width_in: 720, height_in: 48 }] });
  assert.equal(huge.ok, false);
});
