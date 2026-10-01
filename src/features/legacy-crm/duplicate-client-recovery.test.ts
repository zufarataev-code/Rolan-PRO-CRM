import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function loadResolver(db: Record<string, unknown>, base: Record<string, unknown>) {
  const start = html.indexOf("function resolveRejectedDuplicateClient(meta)");
  const end = html.indexOf("async function cloudPersist(");
  assert.ok(start > 0 && end > start, "resolver not found");
  const context = vm.createContext({
    db,
    cloudBaseSnapshot: base,
    state: { selectedClientId: "" },
    localStorage: { setItem() {} },
  });
  vm.runInContext(`${html.slice(start, end)}; this.resolve = resolveRejectedDuplicateClient;`, context);
  return context as unknown as { resolve: (meta: unknown) => string; db: Record<string, unknown>; state: { selectedClientId: string } };
}

test("a new duplicate card is dropped and its records move to the existing client; other edits stay", () => {
  const base = { clients: [{ id: "c_old", phone: "+18055550100" }], orders: [{ id: "o1", clientId: "c_old" }] };
  const db = {
    clients: [{ id: "c_old", phone: "+18055550100" }, { id: "c_new", phone: "805-555-0100" }],
    orders: [{ id: "o1", clientId: "c_old", note: "edited offline" }, { id: "o2", clientId: "c_new" }],
    users: [{ id: "u1", clientId: "c_new" }],
  };
  // The server names the pair in list order, so the "existing" side may be the new card.
  const recovery = loadResolver(db, base);
  recovery.state.selectedClientId = "c_new";

  assert.equal(recovery.resolve({ existing_client_id: "c_new", duplicate_client_id: "c_old" }), "merged");
  assert.deepEqual((recovery.db.clients as Array<{ id: string }>).map((client) => client.id), ["c_old"]);
  assert.equal((recovery.db.orders as Array<{ clientId: string }>)[1].clientId, "c_old");
  assert.equal((recovery.db.orders as Array<{ note?: string }>)[0].note, "edited offline");
  assert.equal((recovery.db.users as Array<{ clientId: string }>)[0].clientId, "c_new", "employee cards are not touched");
  assert.equal(recovery.state.selectedClientId, "c_old");
});

test("an edited card gets its saved phone and email back instead of reloading the CRM", () => {
  const base = { clients: [{ id: "a", phone: "+18055550100", email: "a@x.com" }, { id: "b", phone: "+18055550199", email: "b@x.com" }] };
  const db = {
    clients: [{ id: "a", phone: "+18055550199", email: "a@x.com", name: "Renamed" }, { id: "b", phone: "+18055550199", email: "b@x.com" }],
  };
  const recovery = loadResolver(db, base);

  assert.equal(recovery.resolve({ existing_client_id: "a", duplicate_client_id: "b" }), "reverted");
  const [a] = recovery.db.clients as Array<{ phone: string; name: string }>;
  assert.equal(a.phone, "+18055550100");
  assert.equal(a.name, "Renamed", "the rest of the edit is kept");
});

test("the save loop retries with the repaired snapshot and reloads only as a last resort", () => {
  const block = html.slice(html.indexOf("code === 'duplicate_client'"), html.indexOf("if (response.status === 409) {"));
  assert.match(block, /resolveRejectedDuplicateClient\(result\?\.meta \|\| \{\}\)/);
  assert.match(block, /snapshot = JSON\.parse\(JSON\.stringify\(db\)\);[\s\S]*continue;/);
  assert.match(block, /if \(!resolved\) \{[\s\S]*location\.reload\(\);/);
});
