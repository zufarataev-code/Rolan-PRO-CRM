import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Owner, 2026-11-03: the CRM and client proposal pages are kept out of search.
test("every page says noindex and robots.txt disallows everything", async () => {
  const config = (await import("../../next.config")).default;
  const rules = await config.headers!();
  assert.deepEqual(rules[0].source, "/:path*");
  assert.match(rules[0].headers[0].value, /noindex/);
  const robots = (await import("../../app/robots")).default();
  assert.deepEqual(robots.rules, [{ userAgent: "*", disallow: "/" }]);
  assert.match(readFileSync("app/layout.tsx", "utf8"), /robots: \{ index: false, follow: false/);
});
