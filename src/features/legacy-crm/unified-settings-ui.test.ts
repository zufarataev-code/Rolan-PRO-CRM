import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const legacy = readFileSync(path.join(root, "private/legacy/rolanpro-crm-cloud.html"), "utf8");
const ownerPricing = readFileSync(path.join(root, "app/owner/settings/pricing/page.tsx"), "utf8");
const managerPricing = readFileSync(path.join(root, "app/manager/crm/pricing/page.tsx"), "utf8");
const installerTeam = readFileSync(path.join(root, "app/manager/installers/page.tsx"), "utf8");

test("pricing and installer operations stay inside the main CRM shell", () => {
  assert.match(legacy, /case 'servicePricing': return renderCanonicalServicePricing\(\)/);
  assert.match(legacy, /case 'installerOps': return renderCanonicalInstallerOperations\(\)/);
  assert.match(legacy, /location\.hash = '#\/service-pricing'/);
  assert.match(legacy, /location\.hash = '#\/installer-operations'/);
  assert.doesNotMatch(legacy, /location\.href = user\.role === 'owner' \? '\/owner\/settings\/pricing'/);
});

test("old duplicate-shell routes return to the main CRM", () => {
  assert.match(ownerPricing, /redirect\("\/legacy-crm#\/service-pricing"\)/);
  assert.match(managerPricing, /redirect\("\/legacy-crm#\/service-pricing"\)/);
  assert.match(installerTeam, /redirect\("\/legacy-crm#\/installer-operations"\)/);
});
