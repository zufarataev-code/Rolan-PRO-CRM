import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const stages = readFileSync("private/legacy/production-stages.js", "utf8");

test("a sized service takes free windows of any direction when its own direction has none", () => {
  assert.match(html, /const free = measureAllWindows\(o\)\.filter\(\(\{ win \}\) => !win\.offeringId\);/);
  assert.match(html, /\(own\.length \? own : free\)\.forEach\(\(\{ win \}\) => \{\s*win\.measureScope = direction;\s*applyWindowOffering\(win, offering\);/);
});

test("the window picker offers every window without a film service and moves it to the service direction", () => {
  assert.match(stages, /\(win\.measureScope \|\| o\.serviceType\) === scope \|\| !win\.offeringId\);/);
  assert.match(stages, /win\.measureScope = offeringServiceType\(offering\) \|\| win\.measureScope;\s*applyWindowOffering\(win, offering\);/);
});

test("after adding a service the CRM says what was added and opens it in the card", () => {
  assert.match(html, /try \{ serviceCashierAnnounce\(o, offering\); \} catch/);
  assert.match(html, /function serviceCashierAnnounce\(o, offering\)/);
  assert.match(html, /state\.projectCardSelection = \{ \.\.\.\(state\.projectCardSelection \|\| \{\}\), \[o\.id\]: line\.key \}/);
  assert.match(html, /`Добавлено: «\$\{offering\.name\}»/);
  assert.match(html, /окон с размерами нет — внесите размеры/);
  assert.match(html, /function projectNotice\(text, tone = 'ok'\)/);
});

test("«Редактировать проект» opens the working card; a windows service has a clear «📐 … изменить размеры»", () => {
  const cabinet = readFileSync("private/legacy/project-cabinet.js", "utf8");
  assert.match(cabinet, /One place to edit — the working card itself, not a separate window\./);
  assert.match(stages, /📐 \$\{line\.windows\.length\} \$\{projectWindowsWord\(line\.windows\.length\)\} · изменить размеры/);
});
