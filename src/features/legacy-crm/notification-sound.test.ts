import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function soundBlock() {
  const start = html.indexOf("// ---------- NOTIFICATION SOUND ----------");
  const end = html.indexOf("setInterval(checkNotifySound, 3000);", start);
  assert.ok(start > 0 && end > start, "notification sound block exists");
  return html.slice(start, end);
}

function makeSandbox() {
  const played: number[] = [];
  const store = new Map<string, string>();
  const sandbox: Record<string, unknown> = {
    state: { currentUserId: "u1" },
    db: { notifications: [] as Array<Record<string, unknown>> },
    inbound: [] as Array<{ id: string }>,
    played,
    render: () => {},
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
    navigator: { vibrate: () => played.push(1) },
    window: { addEventListener: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `function myNotifications() { return db.notifications.filter(n => n.userId === state.currentUserId); }
     function unreadInboundClientMessages() { return inbound; }
     ${soundBlock()}`,
    sandbox,
  );
  return sandbox;
}

test("a new unread notice or client message rings once, existing ones stay silent", () => {
  const box = makeSandbox();
  const db = box.db as { notifications: Array<Record<string, unknown>> };
  db.notifications.push({ id: "old", userId: "u1", readAt: null });
  vm.runInContext("checkNotifySound()", box);
  assert.equal((box.played as number[]).length, 0, "first check only remembers what is already there");

  db.notifications.push({ id: "new", userId: "u1", readAt: null });
  vm.runInContext("checkNotifySound()", box);
  assert.equal((box.played as number[]).length, 1);

  vm.runInContext("checkNotifySound()", box);
  assert.equal((box.played as number[]).length, 1, "the same notice does not ring twice");

  (box.inbound as Array<{ id: string }>).push({ id: "sms1" });
  vm.runInContext("checkNotifySound()", box);
  assert.equal((box.played as number[]).length, 2, "an incoming client message rings too");
});

test("muting stops the chime and the topbar shows the toggle", () => {
  const box = makeSandbox();
  vm.runInContext("checkNotifySound(); toggleNotifySound();", box);
  assert.equal(vm.runInContext("notifySoundEnabled()", box), false);
  (box.db as { notifications: Array<Record<string, unknown>> }).notifications.push({ id: "x", userId: "u1", readAt: null });
  vm.runInContext("checkNotifySound()", box);
  assert.equal((box.played as number[]).length, 0);
  assert.match(html, /onclick="toggleNotifySound\(\)"/);
});
