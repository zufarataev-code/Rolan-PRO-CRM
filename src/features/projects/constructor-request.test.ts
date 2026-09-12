import assert from "node:assert/strict";
import test from "node:test";

import {
  isProjectConstructorUuid,
  parseMeasurementConstructorInput,
  parseOpeningMeasurementInput,
  parseProjectConstructorPatch,
} from "./constructor-request";

const POSITION_ID = "11111111-1111-4111-8111-111111111111";
const FILM_ID = "22222222-2222-4222-8222-222222222222";

test("project constructor accepts only canonical UUID route identifiers", () => {
  assert.equal(isProjectConstructorUuid(POSITION_ID), true);
  assert.equal(isProjectConstructorUuid("../../legacy-crm"), false);
});

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
    site_type: "RESIDENTIAL",
    source: "SURVEYOR_VERIFIED",
    opening_id: null,
    cell_id: null,
    opening_type: "french_door",
    room_key: "living_room",
    room_number: null,
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
    room_film_id: null,
    opening_film_id: null,
    film_override_id: "film-20",
  });
});

test("project constructor patch keeps customer type independent from site type", () => {
  assert.deepEqual(
    parseProjectConstructorPatch({ customer_type: "B2B", site_type: "RESIDENTIAL" }),
    {
      customer_type: "B2B",
      site_type: "RESIDENTIAL",
      add_service_type_id: undefined,
      position_updates: [],
    },
  );
  assert.equal(parseProjectConstructorPatch({ customer_type: "commercial" }), null);
});

test("French opening requires explicit cells and accepts film inheritance levels", () => {
  const base = {
    project_position_id: POSITION_ID,
    site_type: "RESIDENTIAL",
    source: "CUSTOMER",
    room_key: "living_room",
    room_name: "Living Room",
    room_film_id: FILM_ID,
    opening_id: "door-1",
    opening_type: "french_door",
    opening_film_id: null,
    overall_width: 72,
    overall_height: 96,
    glass: { construction: "double_pane_igu", treatment: "tempered", low_e: true },
  };

  assert.equal(parseOpeningMeasurementInput({ ...base, cells: [] }), null);
  const parsed = parseOpeningMeasurementInput({
    ...base,
    cells: [
      { cell_id: "cell-1", width: 18, height: 24, removal_required: true },
      { cell_id: "cell-2", width: 18, height: 24, film_override_id: FILM_ID },
    ],
  });
  assert.equal(parsed?.cells.length, 2);
  assert.equal(parsed?.source, "CUSTOMER");
  assert.equal(parsed?.room_film_id, FILM_ID);
  assert.equal(parsed?.cells[0].removal_required, true);
});

test("standard opening derives one cell from overall dimensions", () => {
  const parsed = parseOpeningMeasurementInput({
    project_position_id: POSITION_ID,
    site_type: "COMMERCIAL",
    source: "SURVEYOR_VERIFIED",
    room_key: "office",
    room_name: "Office 201",
    opening_id: "window-1",
    opening_type: "standard_window",
    overall_width: 36,
    overall_height: 48,
    cells: [],
  });
  assert.equal(parsed?.cells.length, 1);
  assert.equal(parsed?.cells[0].width, 36);
  assert.equal(parsed?.cells[0].height, 48);
});

test("French opening rejects duplicate cell identifiers", () => {
  assert.equal(parseOpeningMeasurementInput({
    project_position_id: POSITION_ID,
    site_type: "RESIDENTIAL",
    source: "CUSTOMER",
    room_key: "living_room",
    room_name: "Living Room",
    opening_id: "french-1",
    opening_type: "french_window",
    overall_width: 60,
    overall_height: 80,
    cells: [
      { cell_id: "cell-1", width: 20, height: 40 },
      { cell_id: "cell-1", width: 20, height: 40 },
    ],
  }), null);
});
