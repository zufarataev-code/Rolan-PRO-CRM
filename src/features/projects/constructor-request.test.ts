import assert from "node:assert/strict";
import test from "node:test";

import { parseMeasurementConstructorInput } from "./constructor-request";

test("constructor request requires explicit site type and measurement source", () => {
  assert.equal(parseMeasurementConstructorInput({}), null);
  assert.equal(parseMeasurementConstructorInput({ site_type: "residential" }), null);
  assert.equal(
    parseMeasurementConstructorInput({ site_type: "warehouse", source: "customer" }),
    null,
  );
  assert.equal(
    parseMeasurementConstructorInput({ site_type: "residential", source: "manager" }),
    null,
  );
});

test("constructor request accepts French openings and separated glass fields", () => {
  const result = parseMeasurementConstructorInput({
    site_type: "residential",
    source: "surveyor",
    opening_type: "french_door",
    room_key: "living_room",
    overall_width: 72,
    overall_height: 96,
    pane_index: 3,
    removal_required: true,
    glass: {
      construction: "double_pane_igu",
      treatment: "tempered",
      low_e: true,
      low_e_position: "surface_2",
      laminated: false,
      tinted: false,
    },
    film_override_id: "film-20",
  });

  assert.deepEqual(result, {
    site_type: "residential",
    source: "surveyor",
    opening_type: "french_door",
    room_key: "living_room",
    overall_width: 72,
    overall_height: 96,
    pane_index: 3,
    removal_required: true,
    glass: {
      construction: "double_pane_igu",
      treatment: "tempered",
      low_e: true,
      low_e_position: "surface_2",
      laminated: false,
      tinted: false,
    },
    film_override_id: "film-20",
  });
});
