import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMeasurementConstructorData,
  calculatePaneSqft,
  calculateRemovalSqft,
  evaluateSolarCompatibility,
  glassCompatibilityKeys,
  parseMeasurementConstructorData,
  resolveEffectiveFilm,
  roomTemplatesForSite,
  verificationStatusForSource,
  withMeasurementConstructorData,
} from "./constructor";

test("site type controls room templates independently of client type", () => {
  const residential = roomTemplatesForSite("RESIDENTIAL").map((room) => room.key);
  const commercial = roomTemplatesForSite("COMMERCIAL").map((room) => room.key);

  assert.ok(residential.includes("living_room"));
  assert.ok(residential.includes("bedroom"));
  assert.ok(!residential.includes("conference_room"));
  assert.ok(commercial.includes("conference_room"));
  assert.ok(commercial.includes("technical_room"));
});

test("measurement source deterministically controls verification status", () => {
  assert.equal(verificationStatusForSource("CUSTOMER"), "UNVERIFIED");
  assert.equal(verificationStatusForSource("SURVEYOR_VERIFIED"), "VERIFIED");

  const customer = buildMeasurementConstructorData({ site_type: "RESIDENTIAL", source: "CUSTOMER" });
  const surveyor = buildMeasurementConstructorData({ site_type: "COMMERCIAL", source: "SURVEYOR_VERIFIED" });

  assert.equal(customer.verification_status, "UNVERIFIED");
  assert.equal(surveyor.verification_status, "VERIFIED");
});

test("constructor metadata preserves legacy drawing data instead of replacing it", () => {
  const result = withMeasurementConstructorData(
    { shape: "trapezoid", points: [1, 2, 3] },
    {
      site_type: "RESIDENTIAL",
      source: "CUSTOMER",
      opening_type: "french_door",
      removal_required: true,
      glass: { construction: "double_pane_igu", treatment: "tempered", low_e: true },
    },
  );

  assert.equal(result.shape, "trapezoid");
  assert.deepEqual(result.points, [1, 2, 3]);
  assert.ok(result.constructor_v1);

  const parsed = parseMeasurementConstructorData(result);
  assert.equal(parsed?.opening_type, "french_door");
  assert.equal(parsed?.removal_required, true);
  assert.equal(parsed?.glass.construction, "double_pane_igu");
  assert.equal(parsed?.glass.treatment, "tempered");
  assert.equal(parsed?.glass.low_e, true);
});

test("film inheritance resolves the most specific override", () => {
  assert.deepEqual(
    resolveEffectiveFilm({
      project_film_id: "film-project",
      room_film_id: "film-room",
      opening_film_id: "film-opening",
      pane_film_id: "film-pane",
    }),
    { film_id: "film-pane", source: "pane" },
  );

  assert.deepEqual(
    resolveEffectiveFilm({ project_film_id: "film-project", room_film_id: "film-room" }),
    { film_id: "film-room", source: "room" },
  );

  assert.deepEqual(resolveEffectiveFilm({ project_film_id: "film-project" }), {
    film_id: "film-project",
    source: "service",
  });
});

test("removal totals only selected panes", () => {
  assert.equal(calculatePaneSqft({ width: 36, height: 48 }), 12);
  assert.equal(
    calculateRemovalSqft([
      { width: 36, height: 48, removal_required: true },
      { width: 36, height: 48, removal_required: false },
      { width: 30, height: 60, quantity: 2, removal_required: true },
    ]),
    37,
  );
});

test("glass compatibility keys separate construction and treatment", () => {
  assert.deepEqual(
    new Set(
      glassCompatibilityKeys(
        {
          construction: "single_pane",
          treatment: "tempered",
          low_e: false,
          low_e_position: null,
          laminated: false,
          tinted: false,
        },
        "standard_window",
      ),
    ),
    new Set(["single_tempered", "single_pane"]),
  );

  const igu = glassCompatibilityKeys(
    {
      construction: "double_pane_igu",
      treatment: "tempered",
      low_e: true,
      low_e_position: "surface_2",
      laminated: false,
      tinted: false,
    },
    "french_window",
  );

  assert.ok(igu.includes("dual_pane"));
  assert.ok(igu.includes("low_e"));
  assert.ok(igu.includes("panoramic"));
});

test("solar compatibility is catalog-driven and conservative for unknown glass", () => {
  const blockedOrientation = evaluateSolarCompatibility({
    restricted_orientations: ["south", "west"],
    orientation: "west",
    glass: {
      construction: "double_pane_igu",
      treatment: "tempered",
      low_e: false,
      low_e_position: null,
      laminated: false,
      tinted: false,
    },
  });
  assert.equal(blockedOrientation.status, "NOT_RECOMMENDED");
  assert.ok(blockedOrientation.reason_codes.includes("restricted_orientation"));

  const unknownGlass = evaluateSolarCompatibility({
    allowed_glass_types: ["single_tempered"],
    glass: {
      construction: "unknown",
      treatment: "unknown",
      low_e: false,
      low_e_position: null,
      laminated: false,
      tinted: false,
    },
  });
  assert.equal(unknownGlass.status, "REVIEW");
  assert.ok(unknownGlass.reason_codes.includes("glass_unknown"));

  const allowed = evaluateSolarCompatibility({
    allowed_glass_types: ["dual_pane"],
    orientation: "north",
    glass: {
      construction: "double_pane_igu",
      treatment: "tempered",
      low_e: false,
      low_e_position: null,
      laminated: false,
      tinted: false,
    },
  });
  assert.equal(allowed.status, "OK");
});
