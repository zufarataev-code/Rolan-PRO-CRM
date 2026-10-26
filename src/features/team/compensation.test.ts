import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeCompensationInput } from "./compensation";
import { legacyPayConfigFromCompensation } from "./directory";

test("salary and percentage compensation require a positive configured value", () => {
  assert.throws(
    () => normalizeCompensationInput({ payType: "SALARY", monthlySalary: 0 }),
    /укажите сумму в месяц/i,
  );
  assert.throws(
    () => normalizeCompensationInput({ payType: "COMMISSION", commissionPercent: 101 }),
    /больше 100%/i,
  );
  assert.equal(
    normalizeCompensationInput({ payType: "SALARY", monthlySalary: 4200 }).monthlySalary,
    4200,
  );
});

test("piecework selects services and distinguishes company defaults from employee overrides", () => {
  const normalized = normalizeCompensationInput({
    payType: "PIECEWORK",
    pieceRates: [
      { serviceTypeId: "11111111-1111-4111-8111-111111111111", personalRate: null },
      { serviceAddonId: "22222222-2222-4222-8222-222222222222", personalRate: 52.5 },
    ],
  });
  assert.deepEqual(normalized.pieceRates.map((rate) => rate.personalRate), [null, 52.5]);
  assert.throws(
    () => normalizeCompensationInput({ payType: "PIECEWORK", pieceRates: [] }),
    /хотя бы одно направление/i,
  );
});

test("server compensation becomes the legacy payroll configuration without a second source", () => {
  const payConfig = legacyPayConfigFromCompensation({
    payType: "PIECEWORK",
    monthlySalary: 0,
    hourlyRate: 0,
    commissionPercent: 0,
    fixedPerJob: 0,
    notes: null,
    pieceRates: [
      {
        serviceTypeId: "smart",
        serviceAddonId: null,
        serviceCode: "SMART_FILM",
        serviceAddonCode: null,
        unitType: "sqft",
        companyDefaultRate: 5,
        personalRate: null,
        isEnabled: true,
      },
      {
        serviceTypeId: null,
        serviceAddonId: "zone",
        serviceCode: "SMART_FILM",
        serviceAddonCode: "EXTRA_ELECTRICAL",
        unitType: "fixed",
        companyDefaultRate: 50,
        personalRate: 60,
        isEnabled: true,
      },
    ],
  });
  assert.equal(payConfig.type, "per_sqft");
  assert.equal(payConfig.ratesByServiceCode.SMART_FILM, 5);
  assert.equal(payConfig.ratesByAddonKey["SMART_FILM:EXTRA_ELECTRICAL"], 60);
  assert.equal(payConfig.source, "SERVER_EMPLOYEE_COMPENSATION");
});

test("completed installer work snapshots the resolved employee rate and addon lines", () => {
  const source = readFileSync("src/features/installer-operations/service.ts", "utf8");
  assert.match(source, /resolveEmployeePieceRate/);
  assert.match(source, /rate_source: rateSource/);
  assert.match(source, /line_items: lineItems/);
  assert.match(source, /update: \{\}/, "an existing accrual is immutable after completion");
});

test("employee compensation is owner-only and travels through the canonical team API", () => {
  const createRoute = readFileSync("app/api/v1/team/route.ts", "utf8");
  const updateRoute = readFileSync("app/api/v1/team/[userId]/route.ts", "utf8");
  assert.match(createRoute, /TEAM_ADMIN_ROLES = \[ROLE_CODES\.OWNER\]/);
  assert.match(createRoute, /compensation: body\.compensation/);
  assert.match(updateRoute, /compensation: body\.compensation/);
});
