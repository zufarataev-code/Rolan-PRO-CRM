import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { INTERFACE_LAYER_CSS, INTERFACE_LAYER_HTML, INTERFACE_LAYER_SCRIPT } from "./interface-layer";

const route = readFileSync("app/legacy-crm/route.ts", "utf8");

// Owner, 2026-11-17: the «Кабинет проекта» example is how the whole CRM must
// look — one layer for every tab, our logic untouched, nothing removed.
test("the interface layer is injected last, after the canvas and «Пульс» themes", () => {
  assert.match(route, /import \{ INTERFACE_LAYER_HTML \} from "@\/features\/legacy-crm\/interface-layer";/);
  assert.match(route, /const injectedUi = `\$\{DESIGN_THEME_HTML\}\$\{googleMapsBootstrapPatch\}[^`]*\$\{PULSE_THEME_HTML\}[^`]*\$\{INTERFACE_LAYER_HTML\}`;/);
  assert.match(INTERFACE_LAYER_HTML, /<style id="rolanpro-interface-layer">/);
});

test("it is presentation only: nothing is hidden and layout grids are not touched", () => {
  const hidden = [...INTERFACE_LAYER_CSS.matchAll(/([^{}]+)\{[^{}]*display:\s*none[^{}]*\}/g)].map((match) => match[1].trim());
  // Only decorative stripes of the old menu and the switch in a collapsed menu.
  assert.deepEqual(hidden.map((selector) => selector.replace(/\s+/g, " ")), [
    'html:not([data-rp-style="classic"]) body .app-shell .app-sidebar::before, html:not([data-rp-style="classic"]) body .app-shell .app-sidebar::after',
    ".sidebar-collapsed .rolanpro-style-toggle",
  ]);
  assert.doesNotMatch(INTERFACE_LAYER_CSS, /grid-template-columns|position:\s*(fixed|absolute)|visibility:\s*hidden/);
});

test("every look rule switches off with «Прежний стиль»; meaning colours are left alone", () => {
  const rules = INTERFACE_LAYER_CSS.split("}").map((rule) => rule.split("{")[0].replace(/\/\*[\s\S]*?\*\//g, "").trim()).filter(Boolean);
  for (const selectors of rules) {
    for (const selector of selectors.split(/,\n/).map((item) => item.trim())) {
      assert.ok(selector.startsWith('html:not([data-rp-style="classic"])') || /^\.(rolanpro-style-toggle|sidebar-collapsed)/.test(selector), selector);
    }
  }
  // Status chips keep their tints: only the solid brand blue is re-coloured.
  assert.doesNotMatch(INTERFACE_LAYER_CSS, /\.(bg|text)-(blue|green|amber|purple|red|sky)-(50|100|200)\b/);
});

test("the switch lives in the menu, keeps the choice on the device and is not duplicated", () => {
  const code = INTERFACE_LAYER_SCRIPT.replace(/<\/?script>/g, "");
  const attrs: Record<string, string> = {};
  const store: Record<string, string> = {};
  const buttons: any[] = [];
  const links: any[] = [];
  const host = {
    querySelector: (selector: string) => (selector.includes("crm-next") ? links[0] : buttons[0]) || null,
    appendChild: (button: any) => { buttons.push(button); },
    insertBefore: (link: any) => { links.push(link); },
  };
  const context = vm.createContext({
    window: { requestAnimationFrame: (callback: () => void) => callback() } as any,
    queueMicrotask: (callback: () => void) => callback(),
    localStorage: { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } },
    MutationObserver: class { observe() {} },
    document: {
      documentElement: { setAttribute: (key: string, value: string) => { attrs[key] = value; }, removeAttribute: (key: string) => { delete attrs[key]; } },
      querySelector: (selector: string) => (selector === ".app-sidebar .sidebar-logout-label" ? { closest: () => ({ parentElement: host }) } : null),
      createElement: () => ({ textContent: "", style: {}, setAttribute() {}, addEventListener() {} }),
    },
    // The entry to the new interface (/crm) is shown to the office roles only.
    currentUser: () => ({ role: "owner" }),
  });
  vm.runInContext(code, context);
  assert.equal(attrs["data-rp-style"], undefined, "the new look is on by default");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, "Прежний стиль");
  assert.equal(links.length, 1);
  assert.equal(links[0].href, "/crm");
  assert.equal(links[0].textContent, "Новый интерфейс");
  (context as any).window.rolanproToggleStyle();
  assert.equal(attrs["data-rp-style"], "classic");
  assert.equal(store.rp_style, "classic");
  assert.equal(buttons[0].textContent, "Новый стиль");
  assert.equal(buttons.length, 1);
  (context as any).window.rolanproToggleStyle();
  assert.equal(attrs["data-rp-style"], undefined);
  assert.equal(store.rp_style, undefined);
  assert.equal(links.length, 1, "the entry is not duplicated");
});
