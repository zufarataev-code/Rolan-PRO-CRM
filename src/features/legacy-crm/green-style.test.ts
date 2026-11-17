import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { GREEN_STYLE_CSS, GREEN_STYLE_HTML, GREEN_STYLE_SCRIPT } from "./green-style";

const route = readFileSync("app/legacy-crm/route.ts", "utf8");

// Owner, 2026-11-17: «этот стиль реализуй в нашей CRM, только не сноси у нас
// ничего». The green look is an extra layer each employee turns on themselves.
test("the green style is injected after the canvas theme and removes nothing", () => {
  assert.match(route, /import \{ GREEN_STYLE_HTML \} from "@\/features\/legacy-crm\/green-style";/);
  assert.match(route, /const injectedUi = `\$\{DESIGN_THEME_HTML\}\$\{googleMapsBootstrapPatch\}[^`]*\$\{GREEN_STYLE_HTML\}`;/);
  assert.match(GREEN_STYLE_HTML, /<style id="rolanpro-green-style">/);
  assert.doesNotMatch(GREEN_STYLE_CSS, /display:\s*none/);
});

test("every colour rule applies only while the green style is switched on", () => {
  const rules = GREEN_STYLE_CSS.replace(/@media[^{]*\{[^{}]*\{[^{}]*\}\s*\}/g, "").split("}").map((rule) => rule.split("{")[0].trim()).filter(Boolean);
  for (const selectors of rules) {
    for (const selector of selectors.split(",").map((item) => item.trim())) {
      assert.ok(selector.startsWith('html[data-rp-style="green"]') || selector === ".rolanpro-style-toggle", selector);
    }
  }
  // Status and direction colours keep their meaning: no Tailwind colour utilities are remapped.
  assert.doesNotMatch(GREEN_STYLE_CSS, /\.(bg|text|border)-(blue|green|amber|purple|red)-\d/);
});

test("the switch keeps the choice on the device and survives re-renders", () => {
  const code = GREEN_STYLE_SCRIPT.replace(/<\/?script>/g, "");
  const attrs: Record<string, string> = {};
  const store: Record<string, string> = {};
  const buttons: any[] = [];
  const host = {
    firstChild: null,
    querySelector: () => buttons[0] || null,
    insertBefore: (button: any) => { buttons.push(button); },
  };
  const context = vm.createContext({
    window: { requestAnimationFrame: (callback: () => void) => callback() } as any,
    queueMicrotask: (callback: () => void) => callback(),
    localStorage: { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } },
    MutationObserver: class { observe() {} },
    document: {
      documentElement: { setAttribute: (key: string, value: string) => { attrs[key] = value; }, removeAttribute: (key: string) => { delete attrs[key]; } },
      querySelector: (selector: string) => (selector === ".topbar-actions" ? host : null),
      createElement: () => ({ textContent: "", setAttribute() {}, addEventListener() {} }),
    },
  });
  vm.runInContext(code, context);
  assert.equal(attrs["data-rp-style"], undefined, "off until the employee turns it on");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, "Зелёный стиль");
  (context as any).window.rolanproToggleStyle();
  assert.equal(attrs["data-rp-style"], "green");
  assert.equal(store.rp_style, "green");
  assert.equal(buttons[0].textContent, "Синий стиль");
  assert.equal(buttons.length, 1, "one switch, not one per render");
  (context as any).window.rolanproToggleStyle();
  assert.equal(attrs["data-rp-style"], undefined);
  assert.equal(store.rp_style, undefined);
});
