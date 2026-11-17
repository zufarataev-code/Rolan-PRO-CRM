import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function fn(name: string) {
  const start = legacyCrm.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = legacyCrm.indexOf("\nfunction ", start + 10);
  return legacyCrm.slice(start, next);
}

function loadCompactSwitch(role: string, stored: Record<string, string>) {
  let renders = 0;
  const localStorage = {
    getItem: (key: string) => (key in stored ? stored[key] : null),
    setItem: (key: string, value: string) => { stored[key] = value; },
  };
  const api = new Function("currentUser", "localStorage", "render",
    `${fn("projectCardCompactEnabled")}\n${fn("projectCardToggleCompact")}\nreturn { projectCardCompactEnabled, projectCardToggleCompact };`,
  )(() => ({ role }), localStorage, () => { renders += 1; });
  return { api, renders: () => renders };
}

test("compact Project card is an owner-only, per-device trial", () => {
  const stored: Record<string, string> = {};
  const owner = loadCompactSwitch("owner", stored);
  assert.equal(owner.api.projectCardCompactEnabled(), false);
  owner.api.projectCardToggleCompact();
  assert.equal(stored.rp_project_card_compact, "1");
  assert.equal(owner.api.projectCardCompactEnabled(), true);
  assert.equal(owner.renders(), 1);
  // The same device flag never switches the card for a manager.
  assert.equal(loadCompactSwitch("manager", stored).api.projectCardCompactEnabled(), false);
  owner.api.projectCardToggleCompact();
  assert.equal(owner.api.projectCardCompactEnabled(), false);
});

test("compact header keeps one next-step button and no status text of its own", () => {
  const header = fn("renderProjectCommandHeader");
  const compact = header.slice(header.indexOf("projectCardCompactEnabled()"), header.indexOf('return `<section class="project-command-hero">'));
  assert.match(compact, /pcc-next">\$\{renderOrderActionCard\(primary\)\}/);
  assert.match(compact, /renderOrderCleanProgress\(o\)/);
  assert.doesNotMatch(compact, /T\(o\.status\)/);
  assert.doesNotMatch(compact, /project-command-facts/);
  // The feed's own full-width next step is hidden only inside the compact card.
  assert.match(legacyCrm, /\.project-card-compact \.project-feed-next \{ display:none; \}/);
  assert.match(legacyCrm, /\.project-card-compact \{ width:100%; max-width:1400px;/);
});
