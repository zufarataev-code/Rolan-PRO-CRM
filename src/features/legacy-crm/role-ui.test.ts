import assert from "node:assert/strict";
import test from "node:test";

import { injectRoleUiPolicy } from "./role-ui";

test("role UI policy hides manager-only sensitive navigation and removes duplicate user/install UI", () => {
  const result = injectRoleUiPolicy(`<!doctype html><body><div id="app"></div></body>`);

  assert.match(result, /rolanpro-role-ui-policy-style/);
  assert.match(result, /selectAppView\('payroll'\)/);
  assert.match(result, /selectAppView\('team'\)/);
  assert.match(result, /installRolanProApp/);
  assert.match(result, /sidebar-user/);
  assert.match(result, /rolanpro-top-user-avatar/);
  assert.match(result, /data-rolanpro-role="manager"/);
  assert.match(result, /restrictedManagerViews/);
});

test("role UI policy is injected once", () => {
  const source = `<!doctype html><body><div id="app"></div></body>`;
  const once = injectRoleUiPolicy(source);
  const twice = injectRoleUiPolicy(once);

  assert.equal((twice.match(/id="rolanpro-role-ui-policy-style"/g) || []).length, 1);
  assert.equal((twice.match(/id="rolanpro-role-ui-policy-script"/g) || []).length, 1);
});
