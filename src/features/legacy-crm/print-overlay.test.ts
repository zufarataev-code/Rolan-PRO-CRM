import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const html = readFileSync(path.join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"), "utf8");
const stages = readFileSync(path.join(process.cwd(), "private/legacy/production-stages.js"), "utf8");

// Owner, 2026-11-10 (iPad): «ТЗ для монтажников — белый экран, с которого не выйти».
test("printable documents open inside the CRM, never in a blank popup", () => {
  assert.match(html, /function rpOpenPrintableDocument\(title, html, options = \{\}\)/);
  for (const source of [html, stages]) {
    assert.doesNotMatch(source, /window\.open\(''\s*,\s*'_blank'\)/, "no blank popup + document.write");
    assert.doesNotMatch(source, /document\.write\(/, "no document.write into a popup");
  }
  for (const fn of ["printWorkOrder", "printCutSheet", "printTechnicalSheet", "printProposal"]) {
    const start = html.indexOf(`function ${fn}(`);
    assert.ok(start > 0, fn);
    assert.match(html.slice(start, start + 4000), /rpOpenPrintableDocument\(/, `${fn} uses the in-app viewer`);
  }
  assert.match(stages, /rpOpenPrintableDocument\(`Invoice \$\{inv\.number\}`, invoiceDocumentHtml\(inv\)\)/);
});

test("the Tailwind <script> inside printed sheets is closed with a real closing tag", () => {
  // «<\\/script>» in a template literal yields «<\/script>» — not a closing tag: the sheet went blank.
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com"><\\\\\/script>/);
  assert.match(html, /cdn\.tailwindcss\.com"><\\\/script>/);
  assert.match(html, /frame\.srcdoc = String\(html \|\| ''\)\.replace\(\/<\\\\\\\/script>\/g, '<\\\/script>'\)/);
});

// Owner, 2026-11-10: «жму на монтажника — открывается замерщик».
test("a one-role session lands on the legacy card of that role", () => {
  assert.match(html, /const roleCards = serverRoleCodes\.length === 1 && authenticatedLegacyRole \? allowedCards\.filter\(card => card\.role === authenticatedLegacyRole\) : \[\];/);
  assert.match(html, /const cardChoices = roleCards\.length \? roleCards : allowedCards;/);
  assert.match(html, /const firstAllowed = cardChoices\.find\(card => card\.id === rememberedCard\) \|\| cardChoices\[0\];/);
});
