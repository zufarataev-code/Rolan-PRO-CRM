import assert from "node:assert/strict";
import test from "node:test";

import { formatInches, openingsFromItems } from "./proposal-drawing";

test("inches are shown to the nearest eighth, the precision a film crew works to", () => {
  assert.equal(formatInches(40), "40″");
  assert.equal(formatInches(40.5), "40 ½″");
  assert.equal(formatInches(36.126), "36 ⅛″");
  assert.equal(formatInches(1016 / 25.4), "40″");
});

test("the working drawing takes millimetre measurements, sashes and Smart zones of selected lines only", () => {
  const items = [
    {
      proposal_item_id: "a",
      client_selected: true,
      room_name: "Bedroom",
      title_en: "Window 1 — Smart Film",
      service_type: { service_code: "SMART_FILM" },
      measurement_snapshot: { width: 2438.4, height: 1524, qty: 2, sqft: 80, panels: [{ width: 1219.2, height: 1524 }, { width: 1219.2, height: 1524 }], smart_zones: 2 },
    },
    {
      proposal_item_id: "b",
      client_selected: false,
      room_name: "Kitchen",
      service_type: { service_code: "SOLAR_FILM" },
      measurement_snapshot: { width: 1000, height: 1000 },
    },
    { proposal_item_id: "c", client_selected: true, room_name: "Office", service_type: { service_code: "SOLAR_FILM" } },
  ];
  const rooms = openingsFromItems(items, "en");
  assert.equal(rooms.length, 1, "deselected lines and lines without sizes are not drawn");
  const [opening] = rooms[0].openings;
  assert.equal(rooms[0].room, "Bedroom");
  assert.equal(Math.round(opening.widthIn), 96);
  assert.equal(Math.round(opening.heightIn), 60);
  assert.equal(opening.qty, 2);
  assert.equal(opening.panels.length, 2);
  assert.equal(opening.zones, 2);
  assert.equal(opening.category, "smart");
  assert.equal(opening.title, "Window 1");
});
