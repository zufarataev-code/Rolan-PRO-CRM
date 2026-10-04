import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { DESIGN_THEME_CSS, DESIGN_THEME_HTML } from "./design-theme";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const route = readFileSync("app/legacy-crm/route.ts", "utf8");

test("the design canvas theme is one layer injected for every role", () => {
  assert.match(route, /import \{ DESIGN_THEME_HTML \} from "@\/features\/legacy-crm\/design-theme";/);
  assert.match(route, /const injectedUi = `\$\{DESIGN_THEME_HTML\}\$\{googleMapsBootstrapPatch\}/);
  assert.match(DESIGN_THEME_HTML, /family=Montserrat:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&family=IBM\+Plex\+Mono/);
  assert.match(DESIGN_THEME_HTML, /<style id="rolanpro-design-theme">/);
  // The canvas palette: navy sidebar, blue gradient, 8 px cards.
  assert.match(DESIGN_THEME_CSS, /--rp-navy-top: #24364C;/);
  assert.match(DESIGN_THEME_CSS, /--rp-gradient: linear-gradient\(135deg, #2E5FA8, #3DB5D9\);/);
  assert.match(DESIGN_THEME_CSS, /--radius: 8px;/);
  assert.doesNotMatch(DESIGN_THEME_CSS, /html body \.app-sidebar \{\n {2}position:/, "the sidebar keeps its own (phone) positioning");
});

test("menu and dock use stroke icons; the dock's «+» opens «Создать»", () => {
  const start = html.indexOf("// ---------- ДИЗАЙН CRM: ИКОНКИ И «СОЗДАТЬ»");
  const end = html.indexOf("function renderAppShell() {", start);
  assert.ok(start > 0 && end > start);
  const state: { modal: string | null } = { modal: null };
  const context = vm.createContext({ state, currentUser: () => ({ role: "owner" }), render: () => undefined });
  vm.runInContext(`${html.slice(start, end)}; Object.assign(this, { navIconSvg, openCreateSheet, NAV_ICON_PATHS });`, context);
  const crm = context as unknown as { navIconSvg: (key: string, fallback?: string) => string; openCreateSheet: () => void; NAV_ICON_PATHS: Record<string, string> };
  assert.match(crm.navIconSvg("orders"), /^<svg class="rp-ic" viewBox="0 0 24 24"/);
  assert.equal(crm.navIconSvg("unknown", "🧩"), "🧩", "a section without an icon keeps its emoji");
  for (const key of ["dashboard", "leads", "orders", "calendar", "clients", "inventory", "accounting", "settings", "workday", "installations", "measurements"]) {
    assert.ok(crm.NAV_ICON_PATHS[key], `icon for ${key}`);
  }
  crm.openCreateSheet();
  for (const title of ["Новый проект", "Клиент", "Лиды", "Задача", "Приход рулона", "Закупка"]) assert.match(String(state.modal), new RegExp(title));

  assert.match(html, /<span class="nav-icon">\$\{navIconSvg\(key, icon\)\}<\/span>/);
  assert.match(html, /class="pulse-mobile-header"[\s\S]*?onclick="openCreateSheet\(\)"/);
  assert.match(html, /<button type="button" class="mobile-fab-slot" onclick="openCreateSheet\(\)" aria-label="Создать">/);
  assert.match(html, /\$\{mobileNavItems\.length < 5 \? `<button type="button"/, "«Ещё» stays for the field roles' 4-item dock");
  assert.match(DESIGN_THEME_CSS, /html body \.rp-create-sheet\[data-rolanpro-mobile-action-row\] \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/);
});

test("phones keep the title: the dock's «+» replaces the top-bar create button", () => {
  assert.match(DESIGN_THEME_CSS, /@media \(max-width: 760px\) \{\n {2}html body \.app-topbar button\[onclick="openOrderModal\(\)"\] \{ display: none; \}/);
});
