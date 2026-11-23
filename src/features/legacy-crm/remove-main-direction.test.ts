import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const cabinet = readFileSync("private/legacy/project-cabinet.js", "utf8");

/** The real functions from the page, run against a small project (Owner, 2026-11-22, Zakaz #908). */
function sandbox() {
  const from = html.indexOf("function projectDirectionsInUse(o) {");
  const to = html.indexOf("function projectCardRemovePending(oid, offeringId) {");
  assert.ok(from > 0 && to > from);
  const offerings: Record<string, string> = { privacy_one: "privacy_film", decor_one: "decorative_film" };
  const context = vm.createContext({
    CLOSED_PROJECT_STATUSES: ["installation_done", "act_signed", "payment_received", "completed", "review_received"],
    ORDER_PRIMARY_SERVICES: [
      { id: "privacy_film", tag: "privacy", catalogCategory: "privacy", workflow: ["a"] },
      { id: "decorative_film", tag: "decorative", catalogCategory: "decorative", workflow: ["b"] },
    ],
    measureScopeInfo: (key: string) => ({ key }),
    orderMeasureScope: (o: any) => o.measureScope || o.serviceType,
    serviceOffering: (id: string) => (offerings[id] ? { id } : null),
    offeringServiceType: (offering: any) => (offering ? offerings[offering.id] : ""),
    measureAllWindows: (o: any) => (o.measurements?.rooms || []).flatMap((room: any) => (room.windows || []).map((win: any) => ({ room, win }))),
  });
  vm.runInContext(html.slice(from, to), context);
  return context as any;
}
const project = (extra: Record<string, unknown> = {}) => ({
  status: "consultation_scheduled",
  serviceType: "privacy_film",
  serviceTypes: ["privacy_film", "decorative_film"],
  tags: ["privacy"],
  offeringId: "",
  offeringIds: ["decor_one"],
  offeringCatalogIds: { decor_one: "film_d" } as Record<string, string>,
  extraServices: [] as unknown[],
  measurements: { rooms: [{ windows: [{ measureScope: "decorative_film", offeringId: "decor_one" }] }] },
  ...extra,
});

test("an empty main direction leaves the project and the next one in use becomes the main", () => {
  const { projectReleaseDirection } = sandbox();
  const o: any = project();
  assert.equal(projectReleaseDirection(o, "privacy_film"), true);
  assert.equal(o.serviceType, "decorative_film");
  assert.deepEqual([...o.serviceTypes], ["decorative_film"]);
  assert.deepEqual([...o.tags], ["decorative"]);
});

test("a direction still holding a window, a service or a work line stays", () => {
  const { projectReleaseDirection } = sandbox();
  assert.equal(projectReleaseDirection(project(), "decorative_film"), false);
  const withWindow: any = project({ measurements: { rooms: [{ windows: [{ measureScope: "privacy_film" }] }] } });
  assert.equal(projectReleaseDirection(withWindow, "privacy_film"), false);
  const withLine: any = project({ extraServices: [{ serviceType: "privacy_film" }] });
  assert.equal(projectReleaseDirection(withLine, "privacy_film"), false);
});

test("the only direction of a new project and the main one of a closed project stay", () => {
  const { projectReleaseDirection } = sandbox();
  const fresh: any = project({ offeringIds: [], offeringCatalogIds: {}, measurements: { rooms: [] } });
  assert.equal(projectReleaseDirection(fresh, "privacy_film"), false);
  assert.equal(fresh.serviceType, "privacy_film");
  assert.equal(projectReleaseDirection(project({ status: "completed" }), "privacy_film"), false);
});

test("a removed service takes its material and its empty direction with it — the main service too", () => {
  const { projectForgetOffering } = sandbox();
  const o: any = project({
    offeringId: "privacy_one",
    offeringIds: ["privacy_one", "decor_one"],
    offeringCatalogIds: { privacy_one: "film_p", decor_one: "film_d" },
  });
  projectForgetOffering(o, "privacy_one");
  assert.equal(o.offeringId, "");
  assert.deepEqual([...o.offeringIds], ["decor_one"]);
  assert.deepEqual({ ...o.offeringCatalogIds }, { decor_one: "film_d" });
  assert.equal(o.serviceType, "decorative_film");
});

test("every way to remove a service goes through the same clean-up, and the main service has «Убрать»", () => {
  assert.match(stages, /win\.offeringId = ''; win\.catalogId = ''; \} \}\);\s*projectForgetOffering\(o, line\.offeringId\);/);
  assert.match(cabinet, /win\.offeringId = ''; win\.catalogId = ''; \} \}\);\s*projectForgetOffering\(o, line\.offeringId\);/);
  assert.match(html, /function projectCardRemovePending\(oid, offeringId\) \{\s*const o = getOrder\(oid\);\s*if \(!o \|\| !orderUserCanSeeMoney\(o, currentUser\(\)\)\) return;\s*projectForgetOffering\(o, offeringId\);/);
  assert.doesNotMatch(html + stages, /o\.offeringId !== offering\.id[^\n]{0,120}project(Card|Direction)RemovePending/);
});

test("windows moved to another service free the direction they left; an empty measurement tab has ✕", () => {
  assert.match(html, /left\.forEach\(scope => \{ if \(scope && scope !== direction\) projectReleaseDirection\(o, scope\); \}\);/);
  assert.match(stages, /left\.forEach\(scope => \{ if \(scope && scope !== offeringServiceType\(offering\)\) projectReleaseDirection\(o, scope\); \}\);/);
  assert.match(html, /projectScopes\.length > 1 && measureScopeRemovable\(o, key\)/);
  assert.match(html, /function managerRemoveMeasureScope\(oid, scopeKey\)/);
});
