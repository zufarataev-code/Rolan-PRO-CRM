import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

// Owner, 2026-10-20: a removed surveyor kept appearing in crew, manager and
// task pickers. Every list of people must come from `activeUsers` /
// `usersByRole`, which skip archived (unlinked) employee cards.

const html = readFileSync(join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"), "utf8");

function pickersContext() {
  const start = html.indexOf("function usersByRole(role)");
  const end = html.indexOf("function currentUser()", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const context = vm.createContext({
    db: {
      users: [
        { id: "u_owner", name: "Zufar", role: "owner", active: true },
        { id: "u_mgr", name: "Karina", role: "manager", active: true },
        { id: "u_ghost", name: "Alan (former)", role: "measurer", active: false },
        { id: "u_inst", name: "Rinat", role: "installer" },
      ],
    },
  });
  vm.runInContext(`${html.slice(start, end)}\nthis.api = { usersByRole, activeUsers };`, context);
  return context.api as {
    usersByRole: (role: string) => Array<{ id: string }>;
    activeUsers: (roles?: string[] | null) => Array<{ id: string }>;
  };
}

test("activeUsers skips archived cards and keeps cards without an explicit flag", () => {
  const { activeUsers } = pickersContext();
  assert.deepEqual(activeUsers().map((u) => u.id), ["u_owner", "u_mgr", "u_inst"]);
  assert.deepEqual(activeUsers(["owner", "manager"]).map((u) => u.id), ["u_owner", "u_mgr"]);
  assert.deepEqual(activeUsers(["measurer"]), []);
});

test("usersByRole never returns an archived employee", () => {
  const { usersByRole } = pickersContext();
  assert.deepEqual(usersByRole("measurer"), []);
  assert.deepEqual(usersByRole("installer").map((u) => u.id), ["u_inst"]);
});

test("no people picker in the legacy workspace reads db.users without the active filter", () => {
  // Raw `db.users.map(` or role-only filters build <option>/<label> lists of
  // people; they must go through activeUsers/usersByRole instead.
  const rawPickers = html.match(/\$\{db\.users\.map\(/g) ?? [];
  assert.deepEqual(rawPickers, [], "db.users.map used directly inside a template");
  assert.equal(html.includes("user.isActive !== false"), false, "legacy cards use `active`, not `isActive`");
  assert.equal(html.includes("const candidates = team.length ? team : db.users;"), false);
  assert.equal(html.includes("return users.length ? users : db.users;"), false);
});
