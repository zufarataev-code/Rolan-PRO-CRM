import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const cabinet = readFileSync("private/legacy/project-cabinet.js", "utf8");

test("the left column is the client card: phone, WhatsApp, email and edit under the address", () => {
  assert.match(html, /function projectCommandContactsHtml\(o, c\)/);
  assert.match(html, /\$\{projectCommandContactsHtml\(o, c\)\}<\/div><div class="project-command-hero-actions">/);
  assert.match(html, /href="tel:/);
  assert.match(html, /openClientConversation\('\$\{o\.id\}','whatsapp'\)/);
  assert.match(html, /href="mailto:/);
  assert.match(html, /openClientContactProfile\('\$\{jsQuote\(c\.id \|\| ''\)\}','\$\{o\.id\}'\)">Изменить<\/button>/);
});

test("a collapsed service is one line with price, «Изменить» and a visible 🗑", () => {
  assert.match(stages, /const edit = money && \(!CLOSED_PROJECT_STATUSES\.includes\(o\.status\) \|\| currentUser\(\)\?\.role === 'owner'\);/);
  assert.match(stages, /'✏️ Изменить' : 'Подробнее'/);
  assert.match(stages, /class="project-service-remove"[^`]*onclick="projectCardRemoveLine\('\$\{o\.id\}','\$\{jsQuote\(line\.key\)\}'\)">🗑<\/button>/);
  assert.match(stages, /\$\{selected \? `<div class="project-service-material">/, "material and facts only when the service is open");
  assert.match(cabinet, /function projectCardRemoveLine\(oid, key\) \{\s*projectEditorRemove\(oid, key\);/);
  assert.match(html, /\.project-service-row \{ grid-template-columns:minmax\(0,1fr\) auto auto; \}/);
});
