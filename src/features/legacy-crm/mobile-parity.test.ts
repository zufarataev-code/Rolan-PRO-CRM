import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/legacy-crm/route.ts", "utf8");
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("phone and desktop use the same complete CRM document", () => {
  assert.doesNotMatch(route, /buildMobileCrmShell|mobile-shell|mobileUi/);
  assert.doesNotMatch(legacy, /rolanpro-mobile-crm/);
  assert.match(route, /replaceLegacyBootstrapLogin/);
  assert.match(legacy, /\$\{renderView\(\)\}/);
});

test("mobile navigation is a shortcut layer over the full role navigation", () => {
  assert.match(legacy, /const mobileNavItems =/);
  assert.match(legacy, /\['dashboard', 'Сегодня'/);
  assert.match(legacy, /\['dashboard', 'Обзор'/);
  assert.match(legacy, /\['orders', 'Продажи'/);
  assert.match(legacy, /\['calendar', 'Календарь'/);
  assert.match(legacy, /onclick="selectAppView\('\$\{key\}'\)"/);
  assert.match(legacy, /onclick="toggleSidebar\(\)" aria-label="Открыть все разделы"/);
});

test("the full sidebar still exposes every owner and manager function", () => {
  for (const key of [
    "dashboard",
    "leads",
    "coldcalls",
    "orders",
    "proposals",
    "servicePricing",
    "calendar",
    "installerOps",
    "tasks",
    "academy",
    "clients",
    "inventory",
    "payroll",
    "paymentsdue",
    "accounting",
    "reports",
    "team",
    "referrals",
    "reviews",
    "settings",
  ]) {
    assert.match(legacy, new RegExp(`\\['${key}'`));
  }
  assert.match(legacy, /onclick="logout\(\)"/);
});

test("mobile shortcuts preserve role-specific consultant and installer work", () => {
  assert.match(legacy, /role === 'measurer'/);
  assert.match(legacy, /\['tasks', 'Мои задачи'/);
  assert.match(legacy, /\['measurements', 'Замеры'/);
  assert.match(legacy, /role === 'installer'/);
  assert.match(legacy, /\['installations', 'Работы'/);
  assert.match(legacy, /\['workday', 'Рабочий день'/);
});

test("mobile dock keeps iPhone safe areas and accessible touch targets", () => {
  assert.match(legacy, /mobile-primary-nav/);
  assert.match(legacy, /env\(safe-area-inset-bottom\)/);
  assert.match(legacy, /min-height: 48px/);
  assert.match(legacy, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(legacy, /scroll-padding-bottom:/);
});
