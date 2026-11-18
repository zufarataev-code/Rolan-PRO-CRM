import assert from "node:assert/strict";
import test from "node:test";

import { fieldMeasureDetail, fieldMeasureProjects, windowAreaSqft } from "./view";

const inch = 25.4;
const payload = {
  settings: { inputUnits: "inches" },
  clients: [{ id: "c1", name: "Анна Тест", phone: "+1 818 555 0142", address: "Старый адрес", addresses: [{ id: "a1", address: "15000 Ventura Blvd" }], lifetimeValue: 9876 }],
  orders: [
    {
      id: "o1", number: "R-1", status: "measurement_scheduled", clientId: "c1", addressId: "a1", measurerId: "u_me", measurementAt: "2026-11-20T18:00:00Z",
      serviceType: "solar_film", totalPrice: 5123,
      measurements: { rooms: [{ id: "r1", name: "Гостиная", windows: [
        { id: "w1", name: "Окно 1", width: 36 * inch, height: 60 * inch, qty: 2, winType: "picture", offeringName: "MP35", measurementSource: "SURVEYOR_VERIFIED" },
        { id: "w2", width: 40 * inch, height: 40 * inch, qty: 1, sizePlaceholder: { width: true, height: true }, measureScope: "smart_film", removalRequired: true },
      ] }] },
    },
    { id: "o2", number: "R-2", status: "measurement_done", clientId: "c1", measurerId: "u_other", measurements: { rooms: [] } },
    { id: "o3", number: "R-3", status: "new", clientId: "c1", measurerId: "u_me" },
    { id: "o4", number: "R-4", status: "completed", clientId: "c1", measurerId: "u_me" },
  ],
};
const me = { legacyUserIds: ["u_me"], everyOrderIsMine: false };

test("area follows the legacy rule: actual sizes, then saved panels, times quantity", () => {
  assert.equal(Math.round(windowAreaSqft({ width: 36 * inch, height: 60 * inch, qty: 2 }) * 100) / 100, 30);
  assert.equal(Math.round(windowAreaSqft({ width: 10, height: 10, actualWidth: 12 * inch, actualHeight: 12 * inch, qty: 3, actualQty: 1 }) * 100) / 100, 1);
  // Saved panels are the cut pieces: they define the area until actual panels are confirmed.
  const panels = [{ width: 12 * inch, height: 12 * inch }, { width: 12 * inch, height: 24 * inch }];
  assert.equal(Math.round(windowAreaSqft({ width: 99 * inch, height: 99 * inch, qty: 2, panels }) * 100) / 100, 6);
  assert.equal(Math.round(windowAreaSqft({ width: 12 * inch, height: 12 * inch, qty: 1, panels, actualPanels: [] }) * 100) / 100, 1);
});

test("the list shows only Projects around the survey, scheduled visits first, and marks mine", () => {
  const projects = fieldMeasureProjects(payload, me);
  assert.deepEqual(projects.map((project) => project.id), ["o1", "o3", "o2"]);
  assert.deepEqual(projects.map((project) => project.mine), [true, true, false]);
  assert.equal(projects[0].address, "15000 Ventura Blvd");
  assert.equal(projects[0].windowCount, 3);
  assert.equal(projects[0].sizesMissing, 1);
  assert.equal(fieldMeasureProjects(payload, { legacyUserIds: [], everyOrderIsMine: true }).every((project) => project.mine), true);
});

test("the detail converts to input units, groups by service and carries no money", () => {
  const detail = fieldMeasureDetail(payload, "o1", me);
  assert.ok(detail);
  const [first, second] = detail.rooms[0].windows;
  assert.deepEqual([first.width, first.height, first.qty, first.sqft, first.service, first.verified, first.sizeEntered], [36, 60, 2, 30, "MP35", true, true]);
  assert.deepEqual([second.service, second.removal, second.sizeEntered, second.name], ["Смарт", true, false, "Окно 2"]);
  assert.deepEqual(detail.services.map((service) => [service.name, service.sqft, service.windows]), [["MP35", 30, 2], ["Смарт", 11.1, 1]]);
  assert.equal(/price|lifetime|9876|5123/i.test(JSON.stringify(detail)), false);
  assert.equal(fieldMeasureDetail(payload, "missing", me), null);
});
