import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

import { replaceLegacyBootstrapLogin } from "./html-shell";

test("server removes the embedded PIN login before serving legacy CRM", () => {
  const result = replaceLegacyBootstrapLogin(`<!doctype html><body>
<div id="app"><input id="login-pin"><button>Войти</button></div>
<script>cloudBoot()</script></body>`);

  assert.match(result, /Загрузка ROLANPRO CRM/);
  assert.match(result, /cloudBoot\(\)/);
  assert.doesNotMatch(result, /login-pin/);
});

test("server fails closed when the legacy shell cannot be identified", () => {
  assert.throws(() => replaceLegacyBootstrapLogin("<html></html>"), /shell markers/);
});

test("real legacy CRM is served without its pre-rendered PIN screen", () => {
  const source = readFileSync(
    path.join(process.cwd(), "private", "legacy", "rolanpro-crm-cloud.html"),
    "utf8",
  );
  const result = replaceLegacyBootstrapLogin(source);
  const appStart = result.indexOf('<div id="app"');
  const scriptStart = result.indexOf("\n<script>", appStart);
  const bootstrapShell = result.slice(appStart, scriptStart);

  assert.match(bootstrapShell, /Загрузка ROLANPRO CRM/);
  assert.doesNotMatch(bootstrapShell, /login-pin|Быстрый вход|Demo PINs/);
  assert.doesNotMatch(result, /pin: '0000'|pin: '1111'|pin: '2111'|pin: '3111'/);
});
