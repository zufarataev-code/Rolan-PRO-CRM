import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

type Line = { id: string; serviceType: string; offeringId?: string; catalogId?: string; label?: string; quickProjectLine: boolean };

function load(role = "owner") {
  const start = html.indexOf("// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ");
  const end = html.indexOf("function projectQuickLineCatalog(serviceType", start);
  assert.ok(start > 0 && end > start, "services block not found");
  const db = {
    settings: {
      catalog: [
        { id: "f_mag", category: "solar", brand: "Rolan PRO", model: "Magnetron 05" },
        { id: "f_cer", category: "solar", brand: "Rolan PRO", model: "Ceramic 30" },
        { id: "f_saf", category: "protective", brand: "Rolan PRO", model: "Safety 14 mil" },
      ] as Array<Record<string, unknown>>,
    } as Record<string, unknown>,
    orders: [{ id: "o1", extraServices: [{ id: "l1", quickProjectLine: true, serviceType: "solar_film", offeringId: "svc_solar_magnetronic_05", label: "Solar Control Magnetronic 05" }] as Line[] }],
  };
  const alerts: string[] = [];
  const services = [
    { id: "solar_film", catalogCategory: "solar", title: "Солнцезащитная плёнка", icon: "☀️" },
    { id: "protective_film", catalogCategory: "protective", title: "Защитная плёнка", icon: "🛡" },
  ];
  const context = vm.createContext({
    db,
    ORDER_PRIMARY_SERVICES: services,
    primaryServiceInfo: (id: string) => services.find((s) => s.id === id) || services[0],
    canonicalCatalogCategory: (value: string) => String(value || ""),
    catalogLabel: (item: { brand?: string; model?: string }) => `${item.brand} ${item.model}`,
    getCatalogItem: (id: string) => (db.settings.catalog as Array<{ id: string }>).find((item) => item.id === id),
    projectQuickLineCatalog: (serviceType: string) => (db.settings.catalog as Array<{ category: string }>).filter((item) => item.category === services.find((s) => s.id === serviceType)?.catalogCategory),
    projectQuickLines: (o: { extraServices: Line[] }) => o.extraServices.filter((line) => line.quickProjectLine),
    currentUser: () => ({ id: "u1", role }),
    academyEsc: (value: string) => String(value),
    alert: (message: string) => alerts.push(message),
    save: () => undefined,
    render: () => undefined,
    uid: (() => { let n = 0; return () => `n${++n}`; })(),
  });
  vm.runInContext(`${html.slice(start, end)}; Object.assign(this, { serviceOfferingsAll, serviceOffering, serviceOfferingsFor, projectQuickLineLabel, projectQuickLineFilms, serviceOfferingInstallerRate, addServiceOffering, updateServiceOffering, toggleServiceOfferingFilm, renderServiceOfferingsSection });`, context);
  return { crm: context as unknown as Record<string, (...args: unknown[]) => unknown>, db, alerts };
}

test("the owner's example services exist under their directions, once", () => {
  const { crm } = load();
  const all = crm.serviceOfferingsAll() as Array<{ id: string; direction: string; name: string }>;
  crm.serviceOfferingsAll();
  assert.equal(all.length, 4, "starters are added once, with fixed ids");
  assert.deepEqual([...(crm.serviceOfferingsFor("solar") as Array<{ name: string }>).map((s) => s.name)], ["Solar Control Magnetronic 05", "Spectral 30"]);
  assert.deepEqual([...(crm.serviceOfferingsFor("protective") as Array<{ name: string }>).map((s) => s.name)], ["Safety 14", "Anti-graffiti 30"]);
});

test("direction → service → film: the service narrows the films once films are linked to it", () => {
  const { crm, db } = load();
  const line: Line = { id: "l", quickProjectLine: true, serviceType: "solar_film" };
  assert.equal((crm.projectQuickLineFilms(line) as unknown[]).length, 2, "no service: all solar films");
  line.offeringId = "svc_solar_magnetronic_05";
  assert.equal((crm.projectQuickLineFilms(line) as unknown[]).length, 2, "a service without linked films: all solar films");
  crm.toggleServiceOfferingFilm("svc_solar_magnetronic_05", "f_mag", true);
  assert.deepEqual([...(crm.projectQuickLineFilms(line) as Array<{ id: string }>).map((f) => f.id)], ["f_mag"]);
  assert.equal((db.settings.catalog as Array<Record<string, unknown>>)[0].serviceOfferingId, "svc_solar_magnetronic_05");
});

test("the client sees the service name; the specialist is paid the service rate when it has one", () => {
  const { crm } = load();
  const line: Line = { id: "l", quickProjectLine: true, serviceType: "protective_film", offeringId: "svc_protective_antigraffiti_30" };
  assert.equal(crm.projectQuickLineLabel(line, { brand: "X", model: "Y" }), "Anti-graffiti 30");
  assert.equal(crm.projectQuickLineLabel({ ...line, offeringId: "" }, { brand: "X", model: "Y" }), "X Y");
  assert.equal(crm.serviceOfferingInstallerRate(line), 0, "no own rate: the direction rate applies");
  crm.updateServiceOffering("svc_protective_antigraffiti_30", "installerRatePerSqft", "4");
  crm.updateServiceOffering("svc_protective_antigraffiti_30", "pricePerSqft", "25");
  assert.equal(crm.serviceOfferingInstallerRate(line), 4);
  assert.equal((crm.serviceOffering("svc_protective_antigraffiti_30") as { pricePerSqft: number }).pricePerSqft, 25);
});

test("only the owner changes services; a rename follows into project lines", () => {
  const manager = load("manager");
  manager.crm.addServiceOffering("solar");
  manager.crm.updateServiceOffering("svc_solar_spectral_30", "pricePerSqft", "12");
  assert.equal(manager.alerts.length, 2);
  assert.equal((manager.crm.serviceOffering("svc_solar_spectral_30") as { pricePerSqft: number }).pricePerSqft, 0);

  const { crm, db } = load();
  crm.updateServiceOffering("svc_solar_magnetronic_05", "name", "Magnetronic 05 Pro");
  assert.equal(db.orders[0].extraServices[0].label, "Magnetronic 05 Pro");
  crm.addServiceOffering("decorative");
  assert.equal((crm.serviceOfferingsFor("decorative") as unknown[]).length, 1);
  assert.match(String(crm.renderServiceOfferingsSection()), /Услуги по направлениям[\s\S]*Magnetronic 05 Pro/);
});

test("the project form, pay and «Услуги и цены» use the services", () => {
  assert.match(html, /\} else if \(field === 'offeringId'\) \{/);
  assert.match(html, /onchange="projectEstimateUpdateQuickLine\('\$\{o\.id\}','\$\{line\.id\}','offeringId',this\.value\)"/);
  assert.match(html, /const catalog = projectQuickLineFilms\(line\);/);
  assert.match(html, /function installerRateForQuickLine\(user, line, o = null\) \{\n[^\n]*\n {2}const offeringRate = serviceOfferingInstallerRate\(line\);\n {2}if \(offeringRate > 0\) return offeringRate;/);
  assert.match(html, /\(serviceOfferingInstallerRate\(line\) \|\| filmRate\(filmName, o\)\)/);
  assert.match(html, /\$\{renderServiceOfferingsSection\(\)\}/);
  assert.match(html, /title_en: line\.label \|\|/, "the proposal shows the line label = service name");
});
