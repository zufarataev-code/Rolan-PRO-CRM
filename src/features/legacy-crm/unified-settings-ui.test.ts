import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

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

test("the services menu opens immediately even when a local file emits no hashchange", () => {
  const start = legacy.indexOf("function selectAppView(key)");
  const end = legacy.indexOf("// ---------- ДИЗАЙН CRM", start);
  const state: Record<string, any> = {
    view: "orders",
    modal: "stale modal",
    servicePricingDirection: "solar",
    servicePricingOfferingId: "svc_old",
    mobileSidebarOpen: true,
  };
  const location = { hash: "#/service-pricing" };
  let renders = 0;
  const context = vm.createContext({
    state,
    location,
    currentUser: () => ({ role: "owner" }),
    render: () => { renders += 1; },
    isCompactViewport: () => true,
    window: {},
  });
  vm.runInContext(legacy.slice(start, end), context);
  context.selectAppView("servicePricing");
  assert.equal(location.hash, "#/service-pricing");
  assert.equal(state.view, "servicePricing");
  assert.equal(state.modal, null);
  assert.equal(state.servicePricingDirection, null);
  assert.equal(state.servicePricingOfferingId, null);
  assert.equal(state.mobileSidebarOpen, false);
  assert.equal(renders, 1);
});
