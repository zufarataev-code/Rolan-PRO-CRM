import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const legacy = readFileSync(path.join(root, "private/legacy/rolanpro-crm-cloud.html"), "utf8");
const pricingRoute = readFileSync(path.join(root, "app/api/v1/settings/pricing/route.ts"), "utf8");
const seed = readFileSync(path.join(root, "prisma/seed.ts"), "utf8");

test("one service row shows the customer guide price and installer rate", () => {
  assert.match(legacy, /Справочник расценок на работу/);
  assert.match(legacy, />Клиенту</);
  assert.match(legacy, />Специалисту по установке</);
  assert.match(legacy, /Резервная цена клиенту, \$/);
  assert.match(legacy, /Ставка специалиста автоматически идёт в payroll и экономику проекта/);
});

test("the owner opens the work-rate directory from Settings, not the primary sidebar", () => {
  assert.match(
    legacy,
    /key: 'service-pricing', icon: '💲', title: 'Справочник расценок на работу',[^\n]+destination: 'servicePricing'/,
  );
  assert.match(legacy, /← Все настройки<\/button>/);
  const primaryNavigation = legacy.slice(
    legacy.indexOf("const navItems ="),
    legacy.indexOf("const mobileNavItems ="),
  );
  assert.doesNotMatch(primaryNavigation, /servicePricing|Услуги и цены/);
});

test("pricing API owns the shared difficulty coefficients", () => {
  assert.match(pricingRoute, /prisma\.complexityLevel\.findMany/);
  assert.match(pricingRoute, /complexity_levels: complexityLevels/);
  assert.match(pricingRoute, /entity === "complexity_level"/);
  assert.match(pricingRoute, /Коэффициенты сложности меняет только владелец/);
  assert.match(pricingRoute, /parsed >= 1 && parsed <= 5/);
  assert.match(legacy, /Коэффициенты сложности/);
  assert.match(legacy, /Коэффициент к цене и зарплате/);
  assert.match(legacy, /entity: 'complexity_level'/);
});

test("canonical rates synchronize with legacy payroll without a second directory", () => {
  assert.match(legacy, /syncLegacyInstallerServiceRate\(service\.service_code, service\.installation_cost_per_sqft\)/);
  assert.match(legacy, /const complexityKeys = \{ LOW: 'standard', STANDARD: 'ladder', HIGH: 'tower', EXPERT: 'alpinism' \}/);
  assert.match(legacy, /db\.settings\.complexityCoefs = db\.settings\.complexityCoefs \|\| \{\}/);
  assert.match(legacy, /db\.settings\.complexityCoefs\[key\] = multiplier/);
});

test("the four film directions exist in the server service directory", () => {
  for (const code of ["SMART_FILM", "SOLAR_FILM", "SAFETY_FILM", "DECORATIVE_FILM"]) {
    assert.match(seed, new RegExp(`\\["${code}"`));
  }
  assert.match(seed, /\["DECORATIVE_FILM"[^\n]+"2\.50"/);
});
