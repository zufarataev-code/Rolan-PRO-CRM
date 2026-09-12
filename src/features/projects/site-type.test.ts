import assert from "node:assert/strict";
import test from "node:test";

import { isSiteType, normalizeSiteType } from "./site-type";

test("site type normalization does not infer from arbitrary customer labels", () => {
  assert.equal(normalizeSiteType("residential"), "residential");
  assert.equal(normalizeSiteType("House"), "residential");
  assert.equal(normalizeSiteType("commercial_property"), "commercial");
  assert.equal(normalizeSiteType("B2B"), null);
  assert.equal(normalizeSiteType("contractor"), null);
  assert.equal(normalizeSiteType(undefined), null);
});

test("site type guard accepts only canonical values", () => {
  assert.equal(isSiteType("residential"), true);
  assert.equal(isSiteType("commercial"), true);
  assert.equal(isSiteType("house"), false);
  assert.equal(isSiteType(null), false);
});
