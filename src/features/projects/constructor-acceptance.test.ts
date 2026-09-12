import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMeasurementConstructorData,
  calculatePaneSqft,
  calculateRemovalSqft,
  resolveEffectiveFilm,
} from "./constructor";
import { parseOpeningMeasurementInput, parseProjectConstructorPatch } from "./constructor-request";

const POSITION_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_FILM = "22222222-2222-4222-8222-222222222222";
const ROOM_FILM = "33333333-3333-4333-8333-333333333333";
const CELL_FILM = "44444444-4444-4444-8444-444444444444";

test("representative B2B residential Solar project remains deterministic and auditable", () => {
  const profile = parseProjectConstructorPatch({ customer_type: "B2B", site_type: "RESIDENTIAL" });
  assert.equal(profile?.customer_type, "B2B");
  assert.equal(profile?.site_type, "RESIDENTIAL");

  const customerOpening = parseOpeningMeasurementInput({
    project_position_id: POSITION_ID,
    site_type: "RESIDENTIAL",
    source: "CUSTOMER",
    room_key: "living_room",
    room_name: "Living Room",
    room_film_id: ROOM_FILM,
    opening_id: "french-door-1",
    opening_type: "french_door",
    overall_width: 72,
    overall_height: 96,
    orientation: "west",
    glass: {
      construction: "double_pane_igu",
      treatment: "tempered",
      low_e: true,
      low_e_position: "surface_2",
    },
    cells: [
      { cell_id: "cell-1", width: 18, height: 24, removal_required: true },
      { cell_id: "cell-2", width: 18, height: 24, removal_required: false, film_override_id: CELL_FILM },
      { cell_id: "cell-3", width: 36, height: 72, removal_required: true },
    ],
  });
  assert.ok(customerOpening);
  assert.equal(customerOpening.cells.reduce((sum, cell) => sum + calculatePaneSqft(cell), 0), 24);
  assert.equal(calculateRemovalSqft(customerOpening.cells), 21);
  assert.deepEqual(
    customerOpening.cells.map((cell) => resolveEffectiveFilm({
      project_film_id: PROJECT_FILM,
      room_film_id: customerOpening.room_film_id,
      opening_film_id: customerOpening.opening_film_id,
      pane_film_id: cell.film_override_id,
    })),
    [
      { film_id: ROOM_FILM, source: "room" },
      { film_id: CELL_FILM, source: "pane" },
      { film_id: ROOM_FILM, source: "room" },
    ],
  );

  const customerMetadata = buildMeasurementConstructorData({
    site_type: customerOpening.site_type,
    source: customerOpening.source,
    opening_id: customerOpening.opening_id,
    cell_id: customerOpening.cells[0].cell_id,
    opening_type: customerOpening.opening_type,
    room_key: customerOpening.room_key,
  });
  const verifiedMetadata = buildMeasurementConstructorData({
    ...customerMetadata,
    source: "SURVEYOR_VERIFIED",
  });
  assert.equal(customerMetadata.verification_status, "UNVERIFIED");
  assert.equal(verifiedMetadata.verification_status, "VERIFIED");
  assert.equal(customerMetadata.opening_id, verifiedMetadata.opening_id);
  assert.equal(customerMetadata.cell_id, verifiedMetadata.cell_id);
});
