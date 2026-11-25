import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const script = readFileSync("public/pwa-install.js", "utf8");
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const manifest = readFileSync("app/manifest.ts", "utf8");
const rootLayout = readFileSync("app/layout.tsx", "utf8");
const registration = readFileSync("src/components/pwa-registration.tsx", "utf8");
const serviceWorker = readFileSync("public/sw.js", "utf8");
const shell = readFileSync("src/features/crm-shell/shell.tsx", "utf8");
const login = readFileSync("components/auth-login-form.tsx", "utf8");

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const IPHONE_TELEGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS/11.3";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type FakeNode = {
  tag: string;
  textContent: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  parentNode: FakeNode | null;
  onclick?: () => void;
  type?: string;
  src?: string;
  alt?: string;
  setAttribute: (name: string, value: string) => void;
  appendChild: (child: FakeNode) => FakeNode;
  removeChild: (child: FakeNode) => FakeNode;
};

function node(tag: string): FakeNode {
  const self: FakeNode = {
    tag,
    textContent: "",
    attrs: {},
    children: [],
    parentNode: null,
    setAttribute(name, value) {
      self.attrs[name] = value;
    },
    appendChild(child) {
      child.parentNode = self;
      self.children.push(child);
      return child;
    },
    removeChild(child) {
      self.children = self.children.filter((item) => item !== child);
      child.parentNode = null;
      return child;
    },
  };
  return self;
}

function texts(root: FakeNode): string {
  return [root.textContent, ...root.children.map(texts)].join(" ").replace(/\s+/g, " ").trim();
}

function buttons(root: FakeNode): FakeNode[] {
  return [...(root.tag === "button" ? [root] : []), ...root.children.flatMap(buttons)];
}

function boot({
  userAgent,
  pathname = "/legacy-crm",
  standalone = false,
  inFrame = false,
  storage = new Map<string, string>(),
  now = Date.UTC(2026, 10, 25),
}: {
  userAgent: string;
  pathname?: string;
  standalone?: boolean;
  inFrame?: boolean;
  storage?: Map<string, string>;
  now?: number;
}) {
  const body = node("body");
  const listeners: Record<string, (event: unknown) => void> = {};
  const registered: string[] = [];
  const self: Record<string, unknown> = {};
  const window: Record<string, unknown> = {
    matchMedia: (query: string) => ({
      matches: query.includes("standalone") ? standalone : /pointer: coarse/.test(query) ? !/Macintosh/.test(userAgent) : false,
    }),
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      listeners[name] = handler;
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    prompt: () => null,
  };
  window.self = window;
  window.top = inFrame ? self : window;
  const navigator = {
    userAgent,
    platform: /Macintosh/.test(userAgent) ? "MacIntel" : "iPhone",
    maxTouchPoints: /Macintosh/.test(userAgent) ? 0 : 5,
    standalone,
    serviceWorker: {
      register: (url: string) => {
        registered.push(url);
        return Promise.resolve();
      },
    },
  };
  const document = {
    readyState: "complete",
    body,
    createElement: (tag: string) => node(tag),
    addEventListener: () => null,
  };
  const context = vm.createContext({
    window,
    navigator,
    document,
    location: { pathname, origin: "https://crm.example" },
    Date: { now: () => now },
    Number,
    String,
    Promise,
  });
  vm.runInContext(script, context);
  return {
    body,
    card: () => body.children[0] ?? null,
    api: window.RolanProInstall as { open: () => void; isInstalled: () => boolean },
    fire: (name: string, event: unknown) => listeners[name]?.(event),
    registered,
    storage,
  };
}

test("an iPhone in Safari gets the three Safari steps on the working CRM page", () => {
  const page = boot({ userAgent: IPHONE_SAFARI });
  const offer = page.card();
  assert.ok(offer, "the install card shows");
  assert.match(texts(offer), /Rolan PRO на экран телефона/);
  buttons(offer).find((button) => button.textContent === "Установить")?.onclick?.();
  const steps = texts(page.card() as FakeNode);
  assert.match(steps, /«Поделиться»/);
  assert.match(steps, /«На экран Домой»/);
  assert.match(steps, /«Добавить»/);
  assert.doesNotMatch(steps, /Скопировать ссылку/);
});

test("an iPhone in Chrome or inside Telegram is sent to Safari with a copy-link button", () => {
  for (const userAgent of [IPHONE_CHROME, IPHONE_TELEGRAM]) {
    const page = boot({ userAgent, pathname: "/crm/projects" });
    page.api.open();
    const steps = texts(page.card() as FakeNode);
    assert.match(steps, /Safari/);
    assert.ok(buttons(page.card() as FakeNode).some((button) => button.textContent === "Скопировать ссылку"));
  }
});

test("Android uses Chrome's own install prompt when Chrome offers one", async () => {
  const page = boot({ userAgent: ANDROID_CHROME });
  let prompted = false;
  page.fire("beforeinstallprompt", {
    preventDefault: () => null,
    prompt: () => {
      prompted = true;
    },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  page.api.open();
  assert.equal(prompted, true);
  assert.equal(page.card(), null, "no card stays over Chrome's prompt");
});

test("Android without Chrome's prompt gets the browser-menu steps", () => {
  const page = boot({ userAgent: ANDROID_CHROME });
  page.api.open();
  assert.match(texts(page.card() as FakeNode), /«Установить приложение»/);
});

test("no card for clients, inside the CRM's own frames, once installed, on the sign-in page or on a computer", () => {
  assert.equal(boot({ userAgent: IPHONE_SAFARI, pathname: "/proposal/abc" }).card(), null);
  assert.equal(boot({ userAgent: IPHONE_SAFARI, inFrame: true }).card(), null);
  assert.equal(boot({ userAgent: IPHONE_SAFARI, standalone: true }).card(), null);
  assert.equal(boot({ userAgent: IPHONE_SAFARI, pathname: "/login" }).card(), null);
  assert.equal(boot({ userAgent: DESKTOP_CHROME, pathname: "/crm" }).card(), null);
});

test("«Не сейчас» hides the card for three days, then it comes back", () => {
  const storage = new Map<string, string>();
  const now = Date.UTC(2026, 10, 25);
  const first = boot({ userAgent: IPHONE_SAFARI, storage, now });
  buttons(first.card() as FakeNode).find((button) => button.textContent === "Не сейчас")?.onclick?.();
  assert.equal(first.card(), null);
  assert.equal(boot({ userAgent: IPHONE_SAFARI, storage, now: now + 2 * 24 * 3600 * 1000 }).card(), null);
  assert.ok(boot({ userAgent: IPHONE_SAFARI, storage, now: now + 4 * 24 * 3600 * 1000 }).card());
});

test("there is one service worker, registered by the shared script", () => {
  assert.deepEqual(boot({ userAgent: IPHONE_SAFARI }).registered, ["/sw.js"]);
  assert.match(registration, /src="\/pwa-install\.js"/);
  assert.doesNotMatch(registration, /serviceWorker\.register/);
  assert.match(legacy, /<script src="\/pwa-install\.js" defer><\/script>/);
  // A missing picture must not stop the worker from installing.
  assert.doesNotMatch(serviceWorker, /cache\.addAll/);
});

test("the working CRM page declares one installable manifest and a PNG iPhone icon", () => {
  const head = legacy.slice(0, legacy.indexOf("</head>"));
  assert.equal((head.match(/rel="manifest"/g) ?? []).length, 1);
  assert.match(head, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.doesNotMatch(head, /rel="manifest" href="data:/);
  assert.match(head, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png">/);
  assert.doesNotMatch(head, /rel="apple-touch-icon" href="[^"]*svg/);
  assert.match(legacy, /window\.RolanProInstall\.open\(\)/);
});

test("the manifest has 192 and 512 icons for any use and a stable id", () => {
  assert.match(manifest, /id: "\/"/);
  assert.match(manifest, /src: "\/icon-192\.png",\s*sizes: "192x192",\s*type: "image\/png",\s*purpose: "any"/);
  assert.match(manifest, /src: "\/icon-512\.png",\s*sizes: "512x512",\s*type: "image\/png",\s*purpose: "any"/);
});

test("the new interface keeps its top bar below the iPhone status bar and offers install in the menu", () => {
  assert.match(rootLayout, /statusBarStyle: "default"/);
  assert.match(shell, /Установить на телефон/);
  assert.match(login, /Установить CRM на телефон/);
});

/** Walks the PNG chunks: a file cut short (as the old icons were) ends inside a chunk. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString("latin1"), "PNG", `${file} is a PNG`);
  let offset = 8;
  let sawEnd = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    assert.ok(offset + 12 + length <= bytes.length, `${file}: chunk ${type} runs past the end of the file`);
    if (type === "IEND") sawEnd = true;
    offset += 12 + length;
  }
  assert.ok(sawEnd, `${file} ends with IEND`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("the app icons are whole PNGs of the sizes the manifest and iPhone ask for", () => {
  assert.deepEqual(pngSize("public/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("public/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngSize("public/apple-touch-icon.png"), { width: 180, height: 180 });
});
