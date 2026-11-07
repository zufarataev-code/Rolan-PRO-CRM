import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("ROLANPRO PRIME catalog contains the approved selectable architecture", () => {
  for (const code of [
    "SP05", "SP15", "SP20", "SP35", "SP50", "SP70",
    "SAF02", "SAF04", "SAF08", "SAF12", "SAF14", "SAF16",
    "BS05", "BS15", "BS25",
    "WMP",
  ]) {
    assert.match(source, new RegExp(`code:'${code}'`));
  }

  assert.match(source, /\[5,15,35,50,60\]\.map\(vlt => \(\{ code:`SV/);
  assert.match(source, /\[20,35\]\.map\(vlt => \(\{ code:`CE/);
  assert.match(source, /\[20,35\]\.map\(vlt => \(\{ code:`BV/);
  assert.match(source, /\[20,35\]\.map\(vlt => \(\{ code:`SF/);

  assert.match(source, /selectableInProjects:true/);
  assert.match(source, /reflectivePrivacy \? \['solar'\]/);
  assert.match(source, /reflectivePrivacy \? 'Зеркальная'/);
  assert.match(source, /const allowedCategories = \[film\.category, \.\.\.\(Array\.isArray\(film\.extraCategories\)/);
  assert.match(source, /pending factory confirmation/);
  assert.match(source, /Daytime one-way privacy depends on the lighting difference/);
  assert.doesNotMatch(source, /code:'BS35'/);
});

test("the live cloud workspace persists the catalog migration once", () => {
  assert.match(source, /persistRolanPrimeCatalogMigration = !db\._rolanPrimeCatalogV1/);
  assert.match(source, /db\._rolanPrimeCatalogV1 = true/);
  assert.match(source, /ensureRolanPrimeProductCatalog\(s\.catalog\)/);
});
