import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { prisma } from "@/lib/db";
import { patchGoogleAdsSettings } from "./settings";

const source = readFileSync("private/legacy/production-stages.js", "utf8");
const fakeKey = { type: "service_account", client_email: "offline@example.iam.gserviceaccount.com", private_key: "OFFLINE-PRIVATE-KEY-FIXTURE" };

function serveHandler(context: vm.Context, name: string) {
  const start = source.indexOf("function " + name + "(");
  assert.ok(start > 0, "served handler " + name + " exists");
  vm.runInContext(source.slice(source.lastIndexOf("\n", start) + 1, source.indexOf("\n}", start) + 2), context);
}

type SelectedFile = { size: number; text: () => Promise<string> };

function harness(options: { role?: string; settings?: Record<string, unknown>; file?: SelectedFile; failRequest?: boolean; settingsPatch?: (body: any) => Promise<unknown> } = {}) {
  const requests: Array<{ url: string; method: string; body: any }> = [];
  const alerts: string[] = [];
  const domWrites: string[] = [];
  const logs: unknown[][] = [];
  const storageWrites: unknown[] = [];
  const input = { files: options.file ? [options.file] : [], value: "" };
  let inputValue = options.file ? "C:\\fakepath\\google-key.json" : "";
  Object.defineProperty(input, "value", {
    get: () => inputValue,
    set: (value: string) => { domWrites.push(value); inputValue = value; if (value === "") input.files = []; },
  });
  const fields: Record<string, { value: string }> = {
    "gads-customer": { value: "6421176143" },
    "gads-login": { value: "" },
    "gads-project": { value: "rolanpro" },
    "gads-qualified": { value: "7877132314" },
    "gads-converted": { value: "7877145046" },
    "gads-stage": { value: "" },
  };
  const state = { googleAdsConv: { settings: options.settings, loadedAt: 1, access: { configured: false }, status: {} } };
  let refreshes = 0;
  const storage = { setItem: (...args: unknown[]) => { storageWrites.push(args); } };
  const context: any = vm.createContext({
    state,
    setTimeout: () => 0,
    render: () => {},
    document: { getElementById: (id: string) => id === "gads-sa-file" ? input : fields[id] ?? null },
    currentUser: () => ({ role: options.role ?? "owner" }),
    academyEsc: (value: unknown) => String(value ?? ""),
    alert: (message: string) => { alerts.push(message); },
    console: { log: (...args: unknown[]) => { logs.push(args); }, error: (...args: unknown[]) => { logs.push(args); } },
    localStorage: storage,
    sessionStorage: storage,
    loadGoogleAdsConversions: () => { refreshes += 1; },
    fetch: async (url: string, init: { method: string; credentials: string; body: string }) => {
      assert.equal(init.credentials, "same-origin");
      requests.push({ url, method: init.method, body: JSON.parse(init.body) });
      const data = options.settingsPatch && url === "/api/v1/integrations/google-ads/settings"
        ? await options.settingsPatch(JSON.parse(init.body))
        : { configured: true, source: "crm" };
      return { ok: !options.failRequest, status: options.failRequest ? 400 : 200, json: async () => options.failRequest
        ? { errors: [{ message: fakeKey.private_key }] }
        : { data } };
    },
  });
  for (const name of ["googleAdsConversionsPanelHtml", "googleAdsConvRequest", "googleAdsConvSaveAccess", "googleAdsConvSaveSettings", "googleAdsConvToggleDelivery"]) {
    serveHandler(context, name);
  }
  return { context, state, input, requests, alerts, domWrites, logs, storageWrites, refreshes: () => refreshes };
}

function assertSecretNotPersisted(h: ReturnType<typeof harness>) {
  assert.equal(h.input.value, "");
  assert.deepEqual(h.input.files, []);
  assert.ok(h.domWrites.every(value => value === ""), "file contents never become a DOM value");
  assert.doesNotMatch(JSON.stringify(h.state), /OFFLINE-PRIVATE-KEY-FIXTURE/);
  assert.doesNotMatch(JSON.stringify(h.alerts), /OFFLINE-PRIVATE-KEY-FIXTURE/);
  assert.deepEqual(h.logs, []);
  assert.deepEqual(h.storageWrites, []);
}

test("only the owner sees a JSON file picker rather than editable key text", () => {
  const h = harness();
  const html = h.context.googleAdsConversionsPanelHtml();
  assert.match(html, /id="gads-sa-file" type="file" accept="\.json,application\/json"/);
  assert.doesNotMatch(html, /gads-sa-json|<textarea|OFFLINE-PRIVATE-KEY-FIXTURE/);
  assert.match(html, /googleAdsConvToggleDelivery/);
  assert.equal(harness({ role: "manager" }).context.googleAdsConversionsPanelHtml(), "");
});

test("live-mode copy distinguishes enabled delivery from Google acceptance and bidding decisions", () => {
  const h = harness();
  h.context.state.googleAdsConv.status = { upload_enabled: true, validate_only: false, conversions: { outbox: {} } };
  const html = h.context.googleAdsConversionsPanelHtml();
  assert.match(html, /Живая отправка разрешена/);
  assert.match(html, /Приём и сопоставление проверяйте/);
  assert.match(html, /отдельного решения владельца/);
  assert.doesNotMatch(html, /Google принимает события|Через 4 недели/);
});


test("diagnostics loading never masquerades as an unconfigured or validation-only setup", () => {
  const h = harness();
  h.context.state.googleAdsConv = undefined;
  const html = h.context.googleAdsConversionsPanelHtml();
  assert.match(html, /role="status"/);
  assert.match(html, /Загружаем состояние Google Ads/);
  assert.doesNotMatch(html, /gads-sa-file|Сейчас Google только проверяет|Очередь: пока пусто|googleAdsConvGoLive/);
});

test("cost loading and failed reads keep conversion diagnostics independent without key actions", () => {
  const h = harness();
  serveHandler(h.context, "googleAdsCrmPanelHtml");
  h.context.googleAdsCampaignReportHtml = () => "";
  h.context.googleAdsConversionsPanelHtml = () => '<div data-google-ads-conversions>Independent diagnostics</div>';
  for (const value of [undefined, { loading: true }, { loadedAt: 1, error: "HTTP 403" }]) {
    h.context.state.googleAdsCrm = value;
    const html = h.context.googleAdsCrmPanelHtml();
    assert.match(html, /data-google-ads-conversions/);
    assert.doesNotMatch(html, /Не подключено|googleAdsCrmCreateKey|googleAdsCrmRevokeKey/);
    assert.match(html, value?.error ? /role="alert"/ : /role="status"/);
  }
});

test("a successful empty cost read still offers first-time key creation", async () => {
  const h = harness();
  serveHandler(h.context, "loadGoogleAdsCrm");
  serveHandler(h.context, "googleAdsCrmPanelHtml");
  h.context.googleAdsCampaignReportHtml = () => "";
  h.context.googleAdsConversionsPanelHtml = () => '<div data-google-ads-conversions>Independent diagnostics</div>';
  h.context.fetch = async (url: string) => ({ ok: true, status: 200, json: async () => ({ data: url.includes("integration-keys") ? { active: false } : { campaigns: [], last_imported_at: null } }) });
  await h.context.loadGoogleAdsCrm(true);
  const html = h.context.googleAdsCrmPanelHtml();
  assert.match(html, /googleAdsCrmCreateKey/);
  assert.match(html, /Создать ключ и скрипт/);
  assert.doesNotMatch(html, /googleAdsCrmRevokeKey|role="alert"|role="status"/);
});

test("failed diagnostic GETs retain cached facts and expose only a safe retry state", async () => {
  const endpoints = ["settings", "status", "credentials"];
  for (const endpoint of endpoints) for (const status of [401, 403, 500, ...(endpoint === "credentials" ? [] : [200])]) {
    const settings = { upload_enabled: true, validate_only: false };
    const h = harness({ settings });
    serveHandler(h.context, "loadGoogleAdsConversions");
    let errorBodyRead = false;
    h.context.fetch = async (url: string, init: { method?: string; credentials?: string }) => {
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.method, undefined);
      const failed = url.endsWith("/" + endpoint);
      return { ok: !failed || status === 200, status: failed ? status : 200, json: async () => {
        if (failed) {
          errorBodyRead = true;
          return status === 200 ? { data: { configured: true } } : { errors: [{ message: fakeKey.private_key }] };
        }
        return { data: url.endsWith("/credentials") ? { configured: true } : { configured: true, upload_enabled: true, validate_only: false } };
      } };
    };
    await h.context.loadGoogleAdsConversions(true);
    assert.equal(errorBodyRead, status === 200);
    assert.equal(h.state.googleAdsConv.settings, settings);
    assert.match(h.context.state.googleAdsConv.error, status === 200 ? /Не удалось прочитать режим/ : new RegExp("HTTP " + status));
    const html = h.context.googleAdsConversionsPanelHtml();
    assert.match(html, /role="alert"/);
    assert.match(html, /loadGoogleAdsConversions\(true\)/);
    assert.doesNotMatch(html, /gads-sa-file|googleAdsConvGoLive|googleAdsConvToggleDelivery|OFFLINE-PRIVATE-KEY-FIXTURE|Живая отправка включена|Тестовый режим/);
  }
});

test("malformed diagnostic data is unknown, and a successful retry restores verified live settings", async () => {
  const h = harness({ settings: { upload_enabled: true, validate_only: false } });
  serveHandler(h.context, "loadGoogleAdsConversions");
  const settings = { configured: true, conversion_owner_customer_id: "6421176143", converted_lead_action_id: "7877145046", qualification_pipeline_status_code: "PROPOSAL_SENT", upload_enabled: true, validate_only: false };
  const data: Record<string, unknown> = { settings, status: { configured: true, upload_enabled: true, validate_only: false, conversions: { outbox: {} } }, credentials: { configured: true } };
  let responseData: unknown = null;
  h.context.fetch = async (url: string) => ({ ok: true, status: 200, json: async () => ({ data: responseData === "ready" ? data[url.split("/").at(-1)!] : responseData }) });
  for (const malformed of [null, [], {}]) {
    responseData = malformed;
    await h.context.loadGoogleAdsConversions(true);
    assert.match(h.context.googleAdsConversionsPanelHtml(), /role="alert"/);
    assert.doesNotMatch(h.context.googleAdsConversionsPanelHtml(), /gads-sa-file|Очередь: пока пусто/);
  }
  responseData = "ready";
  await h.context.loadGoogleAdsConversions(true);
  assert.equal(h.context.state.googleAdsConv.error, undefined);
  assert.equal(h.context.state.googleAdsConv.settings, settings);
  assert.match(h.context.googleAdsConversionsPanelHtml(), /Живая отправка включена/);
  assert.match(h.context.googleAdsConversionsPanelHtml(), /value="PROPOSAL_SENT" selected/);
});

test("non-owner diagnostics cannot issue a GET", async () => {
  const h = harness({ role: "manager" });
  serveHandler(h.context, "loadGoogleAdsConversions");
  h.context.fetch = () => { throw new Error("Unexpected non-owner request"); };
  await h.context.loadGoogleAdsConversions(true);
  assert.equal(h.context.googleAdsConversionsPanelHtml(), "");
});

test("a JSON file goes only to the encrypted owner credential endpoint and is cleared", async () => {
  let reads = 0;
  const h = harness({ file: { size: 1024, text: async () => { reads += 1; return JSON.stringify(fakeKey); } } });
  await h.context.googleAdsConvSaveAccess();
  assert.equal(reads, 1);
  assert.deepEqual(h.requests, [{ url: "/api/v1/integrations/google-ads/credentials", method: "PUT", body: { service_account_json: fakeKey } }]);
  assert.equal(h.refreshes(), 1);
  assert.deepEqual(h.alerts, []);
  assertSecretNotPersisted(h);
});

test("oversized and empty files are rejected before their contents are read", async () => {
  for (const size of [0, 64 * 1024 + 1]) {
    let reads = 0;
    const h = harness({ file: { size, text: async () => { reads += 1; throw new Error(fakeKey.private_key); } } });
    await h.context.googleAdsConvSaveAccess();
    assert.equal(reads, 0);
    assert.deepEqual(h.requests, []);
    assert.equal(h.alerts.length, 1);
    assertSecretNotPersisted(h);
  }
});

test("the size limit accepts a valid file of exactly 64 KiB", async () => {
  const h = harness({ file: { size: 64 * 1024, text: async () => JSON.stringify(fakeKey).padEnd(64 * 1024, " ") } });
  await h.context.googleAdsConvSaveAccess();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0].body, { service_account_json: fakeKey });
  assertSecretNotPersisted(h);
});

test("malformed JSON, non-object JSON and file-read errors never send a credential", async () => {
  for (const text of [
    async () => `{${fakeKey.private_key}`,
    async () => "null",
    async () => "[]",
    async () => JSON.stringify(fakeKey.private_key),
    async () => { throw new Error(fakeKey.private_key); },
  ]) {
    const h = harness({ file: { size: 100, text } });
    await h.context.googleAdsConvSaveAccess();
    assert.deepEqual(h.requests, []);
    assert.equal(h.alerts.length, 1);
    assertSecretNotPersisted(h);
  }
});

test("API failures clear the selected file without displaying server-supplied key text", async () => {
  const h = harness({ file: { size: 1024, text: async () => JSON.stringify(fakeKey) }, failRequest: true });
  await h.context.googleAdsConvSaveAccess();
  assert.equal(h.requests.length, 1);
  assert.equal(h.refreshes(), 0);
  assert.equal(h.alerts.length, 1);
  assertSecretNotPersisted(h);
});

test("missing files and non-owner calls cannot read or submit key contents", async () => {
  const missing = harness();
  await missing.context.googleAdsConvSaveAccess();
  assert.deepEqual(missing.requests, []);
  assertSecretNotPersisted(missing);
  let reads = 0;
  const denied = harness({ role: "manager", file: { size: 1024, text: async () => { reads += 1; return JSON.stringify(fakeKey); } } });
  await denied.context.googleAdsConvSaveAccess();
  assert.equal(reads, 0);
  assert.deepEqual(denied.requests, []);
  assertSecretNotPersisted(denied);
});

test("saving IDs keeps new and paused setups paused without processing or live activation", async () => {
  for (const settings of [undefined, { upload_enabled: false, validate_only: true }]) {
    const h = harness({ settings });
    await h.context.googleAdsConvSaveSettings();
    assert.deepEqual(h.requests, [{ url: "/api/v1/integrations/google-ads/settings", method: "PATCH", body: {
      conversion_owner_customer_id: "6421176143", login_customer_id: null, cloud_project_id: "rolanpro",
      qualified_lead_action_id: "7877132314", converted_lead_action_id: "7877145046",
      qualification_pipeline_status_code: null,
    } }]);
  }
});

test("saving a live configuration does not silently reset its mode", async () => {
  const h = harness({ settings: { upload_enabled: true, validate_only: false } });
  await h.context.googleAdsConvSaveSettings();
  assert.equal(h.requests.length, 1);
  assert.equal("upload_enabled" in h.requests[0].body, false);
  assert.equal("validate_only" in h.requests[0].body, false);
});

test("a stale enabled tab cannot undo a server pause, and an ordinary live edit preserves its mode", async t => {
  let current: any = null;
  const previous = prisma.$transaction;
  prisma.$transaction = (async (callback: any) => callback({ googleAdsIntegrationSetting: {
    findUnique: async () => current,
    upsert: async ({ create, update }: any) => { current = current ? { ...current, ...update } : create; return current; },
  } })) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = previous; });
  const savedIds = { conversion_owner_customer_id: "6421176143", login_customer_id: null, qualified_lead_action_id: "7877132314", converted_lead_action_id: "7877145046" };
  for (const [serverMode, cachedMode, expected] of [
    [null, undefined, { upload_enabled: false, validate_only: true }],
    [{ upload_enabled: false, validate_only: true }, { upload_enabled: true, validate_only: false }, { upload_enabled: false, validate_only: true }],
    [{ upload_enabled: true, validate_only: false }, { upload_enabled: false, validate_only: true }, { upload_enabled: true, validate_only: false }],
  ] as const) {
    current = serverMode ? { ...savedIds, ...serverMode } : null;
    const h = harness({ settings: cachedMode, settingsPatch: patchGoogleAdsSettings });
    await h.context.googleAdsConvSaveSettings();
    assert.deepEqual(h.alerts, []);
    assert.equal(h.requests.length, 1);
    assert.deepEqual({ upload_enabled: current.upload_enabled, validate_only: current.validate_only }, expected);
    assert.equal("upload_enabled" in h.requests[0].body, false);
    assert.equal("validate_only" in h.requests[0].body, false);
  }
});

test("settings updates cannot replay stale upload or validation modes over a concurrent pause", async t => {
  const ids = { conversion_owner_customer_id: "6421176143", login_customer_id: null, qualified_lead_action_id: "7877132314", converted_lead_action_id: "7877145046" };
  const previous = prisma.$transaction;
  const updates: any[] = [];
  let current: any;
  prisma.$transaction = (async (callback: any) => callback({ googleAdsIntegrationSetting: {
    findUnique: async () => ({ ...ids, upload_enabled: true, validate_only: false }),
    upsert: async ({ update }: any) => {
      updates.push(update);
      // A different request paused delivery/reset validation after findUnique.
      current = { ...ids, upload_enabled: false, validate_only: true, ...update };
      return current;
    },
  } })) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = previous; });
  const h = harness({ settings: { upload_enabled: true, validate_only: false }, settingsPatch: patchGoogleAdsSettings });
  await h.context.googleAdsConvSaveSettings();
  assert.deepEqual(h.alerts, []);
  assert.equal("upload_enabled" in updates[0], false);
  assert.equal("validate_only" in updates[0], false);
  assert.equal(current.upload_enabled, false);
  assert.equal(current.validate_only, true);

  await patchGoogleAdsSettings({ upload_enabled: false });
  assert.equal(updates[1].upload_enabled, false);
  assert.equal("validate_only" in updates[1], false);
  await patchGoogleAdsSettings({ upload_enabled: true, validate_only: true });
  assert.equal(updates[2].upload_enabled, true);
  assert.equal(updates[2].validate_only, true);
  await patchGoogleAdsSettings({ converted_lead_action_id: "7877145047" });
  assert.equal("upload_enabled" in updates[3], false);
  assert.equal(updates[3].validate_only, true, "a changed destination still requires validation");
});

test("delivery pause and validation enable are separate explicit settings requests", async () => {
  for (const [enabled, expected] of [[true, { upload_enabled: false }], [false, { upload_enabled: true, validate_only: true }]] as const) {
    const h = harness({ settings: { upload_enabled: enabled } });
    await h.context.googleAdsConvToggleDelivery();
    assert.deepEqual(h.requests, [{ url: "/api/v1/integrations/google-ads/settings", method: "PATCH", body: expected }]);
  }
});
