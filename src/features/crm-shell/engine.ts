import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { composeProductionHtml } from "@/features/legacy-crm/production-ui";

/**
 * The new interface shows the CRM's own numbers, not a second copy of them.
 *
 * Every calculation (project sums, stages, next step, funnel, month totals)
 * lives in the working CRM script. Here that same script is loaded on the
 * server without a browser, given the workspace this employee is allowed to
 * see, and asked for ready read models. Nothing is saved from here.
 */

const LEGACY_DIR = path.join(process.cwd(), "private", "legacy");
// The modules the working CRM is composed from, plus the read models of the new interface.
const MODULES = ["production-stages.js", "project-cabinet.js", "owner-board.js", "crm-shell-models.js"];
export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

let compiled: vm.Script | null = null;

export function composeEngineSource(read: (file: string) => string = (file) => readFileSync(path.join(LEGACY_DIR, file), "utf8")) {
  const html = MODULES.reduce((page, file) => composeProductionHtml(page, read(file)), read("rolanpro-crm-cloud.html"));
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const main = scripts.sort((a, b) => b.length - a.length)[0];
  if (!main || !main.includes("function renderOrderCleanProgress(")) throw new Error("CRM script was not found in the legacy page.");
  return main;
}

function engineScript() {
  if (compiled && process.env.NODE_ENV === "production") return compiled;
  compiled = new vm.Script(composeEngineSource(), { filename: "rolanpro-crm-engine.js" });
  return compiled;
}

/** A browser that does nothing: the script only has to load and calculate. */
function createSandbox() {
  const noop: unknown = new Proxy(function () {}, {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : noop),
    apply: () => noop,
    construct: () => noop as object,
  });
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
  };
  const listener = { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true };
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class Channel {
    postMessage() {}
    close() {}
    addEventListener() {}
  }
  const sandbox: Record<string, unknown> = {
    console: { log() {}, info() {}, debug() {}, warn() {}, error() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    queueMicrotask() {},
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    structuredClone,
    atob,
    btoa,
    performance,
    crypto: globalThis.crypto,
    navigator: { userAgent: "rolanpro-server", language: "ru", onLine: true, serviceWorker: noop, clipboard: noop },
    location: {
      protocol: "https:",
      hostname: "server.local",
      host: "server.local",
      pathname: "/legacy-crm",
      hash: "",
      search: "",
      href: "https://server.local/legacy-crm",
      origin: "https://server.local",
      assign() {},
      replace() {},
      reload() {},
    },
    localStorage: storage,
    sessionStorage: storage,
    document: {
      ...listener,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => noop,
      body: noop,
      documentElement: noop,
      head: noop,
      cookie: "",
      readyState: "complete",
      visibilityState: "visible",
      title: "",
    },
    // Network calls never resolve: the engine reads the workspace it was given and nothing else.
    fetch: () => new Promise(() => {}),
    alert() {},
    confirm: () => false,
    prompt: () => null,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    ...listener,
    history: { pushState() {}, replaceState() {} },
    innerWidth: 1280,
    innerHeight: 800,
    screen: {},
    Image: noop,
    Audio: noop,
    FileReader: noop,
    Notification: noop,
    speechSynthesis: noop,
    MutationObserver: Observer,
    IntersectionObserver: Observer,
    ResizeObserver: Observer,
    BroadcastChannel: Channel,
    CustomEvent: class {},
    Event: class {},
  };
  for (const name of ["window", "self", "globalThis", "top", "parent"]) sandbox[name] = sandbox;
  return sandbox;
}

export function resolveTimeZone(value: string | null | undefined) {
  if (!value || value.length > 64) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export type EngineViewer = {
  /** CRM cards this employee may act as (from the employee directory). */
  legacyUserIds: string[];
  /** The CRM role the session is signed in with: "owner" or "manager". */
  role: "owner" | "manager";
  timeZone?: string;
};

export type EngineRequest =
  | { model: "overview" }
  | { model: "projects" }
  | { model: "leadLinks" }
  | { model: "calendar"; from: string; to: string }
  | { model: "project"; projectId: string };

/**
 * Runs the CRM calculations over one workspace and returns a plain JSON model.
 * The call is synchronous on purpose: the time zone of the viewer is applied
 * for its duration only, so dates and month borders match what the same person
 * sees in the working CRM on their own device.
 */
export function runCrmEngine<T>(
  payload: unknown,
  viewer: EngineViewer,
  request: EngineRequest,
  script: vm.Script = engineScript(),
  /** Records the working CRM loads beside the workspace (consultations booked from leads). */
  extras: { consultations?: unknown[] } = {},
): T {
  const sandbox = createSandbox();
  sandbox.__crmShellInput = JSON.stringify({ payload, viewer: { legacyUserIds: viewer.legacyUserIds, role: viewer.role }, request, consultations: extras.consultations });
  const context = vm.createContext(sandbox);
  const previousZone = process.env.TZ;
  process.env.TZ = resolveTimeZone(viewer.timeZone);
  try {
    script.runInContext(context);
    const output = vm.runInContext("crmShellRun(__crmShellInput)", context, { timeout: 5000 }) as string;
    return JSON.parse(output) as T;
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
}
