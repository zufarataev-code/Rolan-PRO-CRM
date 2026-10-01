import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function analyticsSource() {
  const start = html.indexOf("// ---------- АНАЛИТИКА ПО ОБЪЕКТАМ");
  const end = html.indexOf("function renderInstallerTasks()");
  assert.ok(start > 0 && end > start, "analytics block not found");
  return html.slice(start, end);
}

function loadAnalytics(orders: unknown[], userId = "u_1") {
  const catalog: Record<string, { category: string }> = { cat_smart: { category: "smart" } };
  const context = vm.createContext({
    state: {} as Record<string, unknown>,
    db: { orders },
    currentUser: () => ({ id: userId }),
    measureAllWindows: (o: { windows?: unknown[] }) => (o.windows || []).map((win) => ({ win })),
    windowCatalog: (win: { catalogId?: string }) => (win.catalogId ? catalog[win.catalogId] : null),
    filmCategory: (name: string) => (name.toLowerCase().includes("solar") ? "solar" : "other"),
    windowActualAreaSqft: (win: { sqft: number }) => win.sqft,
    projectQuickLines: (o: { quick?: unknown[] }) => o.quick || [],
    getCatalogItem: (id: string) => catalog[id],
    primaryServiceInfo: () => null,
    orderInstallerPayoutPerPerson: (o: { pay?: number }) => o.pay || 0,
    getClient: () => ({ name: "Client" }),
    orderAddress: () => "1 Main St",
    fmtMoney: (value: number) => `$${value.toFixed(2)}`,
    fmtDate: (value: string) => value.slice(0, 10),
    academyEsc: (value: unknown) => String(value),
  });
  vm.runInContext(
    `${analyticsSource()}; this.installerObjectAnalytics = installerObjectAnalytics; this.renderInstallerAnalytics = renderInstallerAnalytics;`,
    context,
  );
  return context as unknown as {
    state: Record<string, unknown>;
    installerObjectAnalytics: (o: unknown, userId: string) => {
      sqft: number;
      mySqft: number;
      team: number;
      done: boolean;
      byCategory: Record<string, number>;
      earned: number;
    };
    renderInstallerAnalytics: () => string;
  };
}

test("object analytics splits the area across the crew and groups it by film type", () => {
  const analytics = loadAnalytics([]);
  const row = analytics.installerObjectAnalytics(
    {
      installerIds: ["u_1", "u_2"],
      installationDoneAt: "2026-09-10T18:00:00Z",
      windows: [
        { catalogId: "cat_smart", sqft: 60 },
        { filmType: "Solar 35", sqft: 40 },
      ],
      pay: 250,
    },
    "u_1",
  );

  assert.equal(row.team, 2);
  assert.equal(row.sqft, 100);
  assert.equal(row.mySqft, 50);
  assert.equal(row.done, true);
  assert.deepEqual({ ...row.byCategory }, { smart: 30, solar: 20 }, "this installer's share by film type");
  assert.equal(row.earned, 250);
});

test("quick project lines count only square-foot lines assigned to this installer", () => {
  const analytics = loadAnalytics([]);
  const row = analytics.installerObjectAnalytics(
    {
      installerIds: ["u_1"],
      status: "installation_scheduled",
      quick: [
        { unit: "sqft", qty: 30, catalogId: "cat_smart", installerIds: ["u_1"] },
        { unit: "zone", qty: 2, installerIds: ["u_1"] },
      ],
    },
    "u_1",
  );

  assert.equal(row.sqft, 30);
  assert.equal(row.mySqft, 30);
  assert.equal(row.done, false);
});

test("quick lines assigned to different installers are split per line, as in the payroll", () => {
  const analytics = loadAnalytics([]);
  const order = {
    installerIds: ["A", "B"],
    installationDoneAt: "2026-09-10T18:00:00Z",
    quick: [
      { unit: "sqft", qty: 30, catalogId: "cat_smart", installerIds: ["A"] },
      { unit: "sqft", qty: 90, serviceType: "solar", installerIds: ["B"] },
      { unit: "sqft", qty: 20, catalogId: "cat_smart", installerIds: ["A", "B"] },
    ],
  };
  const a = analytics.installerObjectAnalytics(order, "A");
  assert.equal(a.sqft, 140);
  assert.equal(a.mySqft, 40);
  assert.deepEqual({ ...a.byCategory }, { smart: 40 }, "only A's film types");
  const b = analytics.installerObjectAnalytics(order, "B");
  assert.equal(b.mySqft, 100);
});

test("the analytics screen lists only finished objects of the chosen period, without client prices", () => {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12).toISOString();
  const longAgo = new Date(now.getFullYear() - 1, 0, 15, 12).toISOString();
  const analytics = loadAnalytics([
    { id: "o1", number: "R-101", installerIds: ["u_1"], installationDoneAt: thisMonth, windows: [{ sqft: 20, filmType: "Solar" }], pay: 50 },
    { id: "o2", number: "R-090", installerIds: ["u_1"], installationDoneAt: longAgo, windows: [{ sqft: 10, filmType: "Solar" }], pay: 25 },
    { id: "o3", number: "R-102", installerIds: ["u_1"], status: "installation_scheduled", windows: [{ sqft: 5 }], pay: 12.5 },
    { id: "o4", number: "R-103", installerIds: ["u_9"], installationDoneAt: thisMonth, windows: [{ sqft: 99 }], pay: 999 },
  ]);

  const month = analytics.renderInstallerAnalytics();
  assert.match(month, /R-101/);
  assert.doesNotMatch(month, /R-090/);
  assert.doesNotMatch(month, /R-103/);
  assert.match(month, /\$12\.50/);
  assert.doesNotMatch(month, /retail|Цена для клиента|маржа/i);

  analytics.state.installerAnalyticsPeriod = "all";
  const all = analytics.renderInstallerAnalytics();
  assert.match(all, /R-101/);
  assert.match(all, /R-090/);
});

test("the installer reaches analytics from the menu and from «Сегодня»", () => {
  assert.match(html, /\['analytics', 'Аналитика', '📈'\]/);
  assert.match(html, /case 'analytics': return renderInstallerAnalytics\(\);/);
  assert.match(html, /onclick="selectAppView\('analytics'\)"/);
});

test("the installer title is «Специалист по установке» everywhere", () => {
  assert.doesNotMatch(html, /[Мм]онтажник/);
  // The provisioning workspace and the stored SMS templates too.
  assert.doesNotMatch(readFileSync("data/legacy-crm-empty.json", "utf8"), /[Мм]онтажник/);
  assert.match(
    readFileSync("prisma/migrations/20261001130000_installer_title_in_sms_templates/migration.sql", "utf8"),
    /'Монтажник', 'Специалист по установке'/,
  );
  assert.match(html, /installer: 'Специалист по установке'/);
  assert.match(html, /\{ role: 'installer', title: T\('installers'\) \}/);
  assert.match(readFileSync("components/team-directory.tsx", "utf8"), /label: "Специалист по установке"/);
  assert.match(readFileSync("src/lib/auth/constants.ts", "utf8"), /ru: "Специалист по установке"/);
});
