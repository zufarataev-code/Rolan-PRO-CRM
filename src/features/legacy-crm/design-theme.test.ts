import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { DESIGN_THEME_CSS, DESIGN_THEME_HTML } from "./design-theme";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const route = readFileSync("app/legacy-crm/route.ts", "utf8");

type Item = [string, string, string[]?, string?];
type Crm = {
  navIconSvg: (key: string, fallback?: string) => string;
  openCreateSheet: () => void;
  NAV_ICON_PATHS: Record<string, string>;
  crm2NavGroups: () => Array<[string, Item[]]>;
  crm2NavIsActive: (item: Item) => boolean;
  crm2CreateItems: () => Array<{ label: string; action: string }>;
  crm2SectionTabs: () => string;
  crm2HeaderTitle: () => string;
  crm2Eyebrow: () => string;
  crm2Go: (key: string) => void;
  crm2T: (text: string) => string;
};

function loadShell(role: string) {
  const start = html.indexOf("// ---------- ДИЗАЙН CRM: ИКОНКИ И «СОЗДАТЬ»");
  const end = html.indexOf("function renderAppShell() {", start);
  assert.ok(start > 0 && end > start);
  const state: Record<string, unknown> = { modal: null, view: "dashboard" };
  const opened: string[] = [];
  const document = { addEventListener: () => undefined, querySelectorAll: () => [] };
  const context = vm.createContext({
    state,
    document,
    currentUser: () => ({ role }),
    render: () => undefined,
    selectAppView: (key: string) => { opened.push(key); state.view = key; },
    headerTitle: () => "📄 Коммерческие предложения",
    T: (key: string) => key,
  });
  vm.runInContext(
    `${html.slice(start, end)}; Object.assign(this, { navIconSvg, openCreateSheet, NAV_ICON_PATHS, crm2NavGroups, crm2NavIsActive, crm2CreateItems, crm2SectionTabs, crm2HeaderTitle, crm2Eyebrow, crm2Go, crm2T });`,
    context,
  );
  return { crm: context as unknown as Crm, state, opened };
}

test("CRM 2.0 is one square, bordered layer injected for every role", () => {
  assert.match(route, /import \{ DESIGN_THEME_HTML \} from "@\/features\/legacy-crm\/design-theme";/);
  assert.match(route, /const injectedUi = `\$\{DESIGN_THEME_HTML\}\$\{googleMapsBootstrapPatch\}/);
  assert.match(DESIGN_THEME_HTML, /family=Montserrat:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&family=IBM\+Plex\+Mono/);
  assert.match(DESIGN_THEME_HTML, /<style id="rolanpro-design-theme">/);
  // Square everywhere, and strong enough to beat the phone layer's 16 px !important.
  assert.match(DESIGN_THEME_CSS, /html body \*:not\(#rp-square\),\nhtml body \*:not\(#rp-square\)::before,\nhtml body \*:not\(#rp-square\)::after \{ border-radius: 0 !important; \}/);
  assert.match(DESIGN_THEME_CSS, /--radius: 0px;/);
  // Flat navy menu, one blue, 1 px borders, no card shadows, no gradients.
  assert.match(DESIGN_THEME_CSS, /--rp-navy: #121C2A;/);
  assert.match(DESIGN_THEME_CSS, /--rp-line: #D3DAE3;/);
  assert.match(DESIGN_THEME_CSS, /html body \.card,\nhtml body \.pw-panel,\nhtml body \.pw-funnel \{\n {2}background: #fff;\n {2}border: 1px solid var\(--rp-line\);\n {2}box-shadow: none;/);
  assert.doesNotMatch(DESIGN_THEME_CSS, /gradient/);
  assert.doesNotMatch(DESIGN_THEME_CSS, /html body \.app-sidebar \{\n {2}position:/, "the sidebar keeps its own (phone) positioning");
});

test("buttons are square but alive: lift on hover, sink on press", () => {
  assert.match(DESIGN_THEME_CSS, /html body \.btn-primary:hover:not\(:disabled\),\nhtml body \.btn-ghost:hover:not\(:disabled\),[\s\S]*?\{ transform: translateY\(-2px\); box-shadow: var\(--rp-lift\); \}/);
  assert.match(DESIGN_THEME_CSS, /html body \.btn-primary:active:not\(:disabled\),[\s\S]*?\{ transform: translateY\(0\) scale\(\.97\); box-shadow: none; \}/);
  assert.match(DESIGN_THEME_CSS, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the office menu is 6 groups; managers do not see the owner's money and people", () => {
  const owner = loadShell("owner").crm;
  const ownerGroups = JSON.parse(JSON.stringify(owner.crm2NavGroups().map(([title, items]) => [title, items.map((item) => item[1])])));
  assert.deepEqual(ownerGroups, [
    ["", ["Главная"]],
    ["Продажи", ["Лиды", "Воронка", "Расчёт и КП", "Клиенты"]],
    ["Работы", ["Календарь", "Замеры", "Монтажи", "Задачи"]],
    ["Склад", ["Рулоны и материалы", "Закупки"]],
    ["Деньги", ["Счета и операции", "Оплаты клиентов", "Зарплата", "Отчёты"]],
    ["Компания", ["Услуги и цены", "Сотрудники", "Академия"]],
  ]);
  const manager = loadShell("manager").crm;
  const managerKeys = manager.crm2NavGroups().flatMap(([, items]) => items.map((item) => item[0]));
  for (const hidden of ["accounting", "paymentsdue", "payroll", "team"]) assert.ok(!managerKeys.includes(hidden), hidden);
  for (const shown of ["leads", "orders", "proposals", "clients", "calendar", "inventory", "purchases", "reports"]) assert.ok(managerKeys.includes(shown), shown);
});

test("merged screens keep one menu item and a tab strip; «Закупки» opens the warehouse tab", () => {
  const { crm, state, opened } = loadShell("owner");
  const item = (key: string) => crm.crm2NavGroups().flatMap(([, items]) => items).find((entry) => entry[0] === key) as Item;
  state.view = "coldcalls";
  assert.ok(crm.crm2NavIsActive(item("leads")), "«Лиды» stays lit on cold calls");
  assert.match(crm.crm2SectionTabs(), /Входящие[\s\S]*class="on"[^>]*>Холодные звонки/);
  assert.equal(crm.crm2Eyebrow(), "Продажи");
  assert.equal(crm.crm2HeaderTitle(), "Лиды");
  state.view = "reviews";
  assert.ok(crm.crm2NavIsActive(item("clients")));
  state.view = "proposals";
  assert.match(crm.crm2SectionTabs(), /openRolanProCalculator\(\)">Быстрый калькулятор/);

  crm.crm2Go("purchases");
  assert.equal(state.inventoryTab, "purchases");
  assert.equal(opened[opened.length - 1], "inventory");
  assert.ok(crm.crm2NavIsActive(item("purchases")) && !crm.crm2NavIsActive(item("inventory")));
  crm.crm2Go("inventory");
  assert.equal(state.inventoryTab, "overview");

  state.view = "dashboard";
  assert.equal(crm.crm2HeaderTitle(), "Коммерческие предложения", "own titles lose the old emoji");
});

test("one «+ Создать»: the top bar menu and the phone's «+» list the same things", () => {
  const { crm, state } = loadShell("owner");
  const labels = [...crm.crm2CreateItems().map((item) => item.label)];
  assert.deepEqual(labels, ["Лид / проект", "Холодный контакт", "Клиент", "Быстрый расчёт", "Задача", "Приход рулона", "Заявка на закупку", "Операция / чек"]);
  assert.equal(crm.crm2CreateItems().find((item) => item.label === "Лид / проект")?.action, "openOrderModal()");
  assert.ok(!loadShell("manager").crm.crm2CreateItems().some((item) => item.label === "Операция / чек"), "money only for the owner");
  assert.equal(loadShell("installer").crm.crm2CreateItems().length, 0);

  crm.openCreateSheet();
  for (const label of labels) assert.match(String(state.modal), new RegExp(label));
  assert.match(DESIGN_THEME_CSS, /html body \.crm2-create-list\[data-rolanpro-mobile-action-row\] \{ display: flex !important; flex-direction: column !important;/);

  assert.match(html, /<button type="button" class="btn-primary crm2-create-btn" onclick="crm2ToggleMenu\('create', event\)"/);
  assert.doesNotMatch(html, /title="Создать новый проект">\+ Проект<\/button>/, "no second «+ Проект» in the top bar");
  assert.doesNotMatch(html, /<button class="btn-primary" onclick="openOrderModal\(\)">\+ Новый проект<\/button>/, "no second one on the dashboard");
  assert.doesNotMatch(html, /<div class="orders-command-title">Проекты<\/div>/, "the funnel title is shown once, in the top bar");
});

test("«Сменить» and «Выйти» became the user's menu with language and settings", () => {
  const shell = html.slice(html.indexOf("function renderAppShell() {"), html.indexOf("function headerTitle() {"));
  assert.doesNotMatch(shell, />Сменить<\/button>/);
  assert.match(shell, /class="topbar-user-pill" title="\$\{academyEsc\(u\.name\)\}" onclick="crm2ToggleMenu\('user', event\)"/);
  assert.match(shell, /class="crm2-menu-item danger" role="menuitem" onclick="logout\(\)"/);
  assert.match(shell, /onclick="crm2CloseMenus\(\); selectAppView\('settings'\)"/);
  assert.match(shell, /onclick="state\.lang='en'; save\(\); render\(\);">EN<\/button>/);
});

test("menu and dock use stroke icons; the calculator lives in «Расчёт и КП», not in the menu", () => {
  const { crm } = loadShell("owner");
  assert.match(crm.navIconSvg("orders"), /^<svg class="rp-ic" viewBox="0 0 24 24"/);
  assert.equal(crm.navIconSvg("unknown", "🧩"), "🧩", "a section without an icon keeps its emoji");
  for (const [, items] of crm.crm2NavGroups()) for (const [key] of items) assert.ok(crm.NAV_ICON_PATHS[key], `icon for ${key}`);
  for (const key of ["workday", "installations", "measurements", "bell", "chat", "search", "menu", "chevron", "settings"]) assert.ok(crm.NAV_ICON_PATHS[key], `icon for ${key}`);

  assert.match(html, /<span class="nav-icon">\$\{navIconSvg\(key, icon\)\}<\/span>/);
  assert.match(html, /class="pulse-mobile-header"[\s\S]*?onclick="openCreateSheet\(\)"/);
  assert.match(html, /<button type="button" class="mobile-fab-slot" onclick="openCreateSheet\(\)" aria-label="Создать">/);
  assert.match(html, /\$\{mobileNavItems\.length < 5 \? `<button type="button"/, "«Меню» closes every 4-item dock");
  assert.doesNotMatch(route, /ensureCalculatorNav|data-rolanpro-calculator-nav/);
  assert.match(route, /window\.openRolanProCalculator = function openRolanProCalculator\(dealId\)/);
});

test("phone = «Пульс бизнеса», computer = CRM 2.0: one create control and a reachable user menu", () => {
  // Owner, 2026-10-04: «Телефон — Пульс, компьютер — CRM 2.0».
  const phone = "@media (max-width: 520px), (max-width: 768px) and (pointer: coarse) {";
  assert.match(DESIGN_THEME_CSS, new RegExp(`${phone.replace(/[()]/g, "\\$&")}\\n {2}html body \\.crm2-create-wrap \\{ display: none; \\}\\n {2}html body \\.app-shell \\.crm2-user-wrap \\.topbar-user-pill \\{ display: inline-flex !important; \\}`));
  assert.match(html, /<div class="pulse-mobile-header">[\s\S]*?onclick="openCreateSheet\(\)" aria-label="Создать"/, "the Pulse header «+» creates on phones");
  assert.match(DESIGN_THEME_CSS, /@media \(max-width: 760px\) \{\n {2}html body \.app-topbar \.topbar-icon-btn\[aria-label="Настройки"\] \{ display: none; \}/);

  // Pulse colours only on phones; on the computer the CRM 2.0 navy, blue and borders win.
  const pulse = readFileSync("src/features/legacy-crm/pulse-theme.ts", "utf8");
  const phoneStart = pulse.indexOf(phone);
  assert.ok(phoneStart > 0);
  for (const rule of [".app-sidebar { background: #10253F; }", ".btn-primary { background: #1686B0; box-shadow: none; }", ".card { box-shadow: none; border-color: #E0E7EE; }", "--rp-gradient: #1686B0;"]) {
    const at = pulse.indexOf(rule);
    assert.ok(at > phoneStart, `${rule} is phone-only`);
  }
});

test("the RU/EN switch also translates the new menu, tabs and titles", () => {
  const { crm, state } = loadShell("owner");
  state.lang = "en";
  assert.equal(crm.crm2T("Воронка"), "Pipeline");
  assert.equal(crm.crm2T("Деньги"), "Money");
  state.view = "coldcalls";
  assert.equal(crm.crm2HeaderTitle(), "Leads");
  assert.equal(crm.crm2Eyebrow(), "Sales");
  assert.match(crm.crm2SectionTabs(), />Inbound<[\s\S]*>Cold calls</);
  state.lang = "ru";
  assert.equal(crm.crm2HeaderTitle(), "Лиды");
  const shell = html.slice(html.indexOf("function renderAppShell() {"), html.indexOf("function headerTitle() {"));
  assert.match(shell, /<span class="nav-label">\$\{crm2T\(item\[1\]\)\}<\/span>/);
  assert.match(shell, /<div class="crm2-nav-group-title">\$\{crm2T\(title\)\}<\/div>/);
});

