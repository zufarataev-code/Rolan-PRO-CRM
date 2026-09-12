import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const legacyCrm = fs.readFileSync(
  path.join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("canonical project constructor stays inside the one legacy CRM shell", () => {
  assert.match(legacyCrm, /\['canonicalProjects', 'Проекты', '🏗'\]/);
  assert.ok(legacyCrm.includes("const canonicalProject = h.match(/^#\\/projects\\/([^/]+)$/)"));
  assert.match(legacyCrm, /renderCanonicalProjects\(\)/);
  assert.match(legacyCrm, /\/api\/v1\/projects\/constructor/);
  assert.doesNotMatch(legacyCrm, /canonicalProjectRequest\([^)]*localStorage/);
});

test("legacy CRM inline script remains valid JavaScript", () => {
  const script = legacyCrm.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("Solar V1 UI exposes source, inheritance, French cells, glass and removal", () => {
  assert.match(legacyCrm, /Customer · UNVERIFIED/);
  assert.match(legacyCrm, /Surveyor · VERIFIED/);
  assert.match(legacyCrm, /Room film override/);
  assert.match(legacyCrm, /Opening film override/);
  assert.match(legacyCrm, /Film override/);
  assert.match(legacyCrm, /French Window/);
  assert.match(legacyCrm, /French Door/);
  assert.match(legacyCrm, /Glass construction/);
  assert.match(legacyCrm, /Heat-strengthened/);
  assert.match(legacyCrm, /Low-E/);
  assert.match(legacyCrm, /Removal/);
  assert.match(legacyCrm, /NOT RECOMMENDED/);
});

test("surveyor uses assigned canonical projects without finance controls", () => {
  assert.match(legacyCrm, /\['canonicalProjects', 'Замеры проектов', '🏗'\]/);
  assert.match(legacyCrm, /currentUser\(\)\?\.role === 'measurer'/);
  assert.match(legacyCrm, /sourceSelect\.disabled = true/);
});
